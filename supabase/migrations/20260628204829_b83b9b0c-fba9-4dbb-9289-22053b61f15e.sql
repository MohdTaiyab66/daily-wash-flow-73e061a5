
-- ============= 1. vehicle_catalog extensions =============
ALTER TABLE public.vehicle_catalog
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body_type text,
  ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS popularity integer NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_make_trgm ON public.vehicle_catalog USING gin (make gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_model_trgm ON public.vehicle_catalog USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_catalog_aliases ON public.vehicle_catalog USING gin (aliases);

-- ============= 2. service_catalog category =============
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'one_time';
-- categories: subscription | one_time | deep_clean | addon | premium

UPDATE public.service_catalog SET category = 'subscription' WHERE service_type = 'subscription';
UPDATE public.service_catalog SET category = 'one_time' WHERE service_type = 'one_time';

-- ============= 3. service_leads (admin ops module) =============
CREATE TABLE IF NOT EXISTS public.service_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  customer_name text,
  customer_phone text,
  vehicle_id uuid,
  vehicle_label text,
  address_id uuid,
  address_text text,
  service_id uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  service_slug text,
  service_name text,
  service_category text NOT NULL DEFAULT 'one_time',
  price numeric NOT NULL DEFAULT 0,
  payment_id uuid,
  payment_status text DEFAULT 'paid',
  scheduled_date date,
  scheduled_time text,
  status text NOT NULL DEFAULT 'new', -- new | assigned | in_progress | completed | cancelled
  assigned_detailer_id uuid,
  assigned_detailer_name text,
  assigned_at timestamptz,
  notes text,
  photos text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);
GRANT SELECT, INSERT, UPDATE ON public.service_leads TO authenticated;
GRANT ALL ON public.service_leads TO service_role;
ALTER TABLE public.service_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all leads" ON public.service_leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Customers view own leads" ON public.service_leads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_service_leads_status ON public.service_leads(status);
CREATE INDEX IF NOT EXISTS idx_service_leads_user ON public.service_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_service_leads_scheduled ON public.service_leads(scheduled_date);

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_service_leads_touch ON public.service_leads;
CREATE TRIGGER trg_service_leads_touch BEFORE UPDATE ON public.service_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.service_leads;

-- ============= 4. subscription_addon_requests =============
CREATE TABLE IF NOT EXISTS public.subscription_addon_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  customer_name text,
  customer_phone text,
  vehicle_id uuid,
  vehicle_label text,
  service_id uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  service_name text,
  service_slug text,
  preferred_date date,
  preferred_time text,
  status text NOT NULL DEFAULT 'new', -- new | scheduled | in_progress | completed | cancelled
  assigned_detailer_id uuid,
  assigned_detailer_name text,
  scheduled_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.subscription_addon_requests TO authenticated;
GRANT ALL ON public.subscription_addon_requests TO service_role;
ALTER TABLE public.subscription_addon_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage addon requests" ON public.subscription_addon_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Customers manage own addon requests" ON public.subscription_addon_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_addon_requests_touch ON public.subscription_addon_requests;
CREATE TRIGGER trg_addon_requests_touch BEFORE UPDATE ON public.subscription_addon_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_addon_requests;

-- ============= 5. activate_paid_booking — route by category =============
CREATE OR REPLACE FUNCTION public.activate_paid_booking(
  p_booking_id uuid,
  p_provider_order_id text DEFAULT NULL,
  p_provider_payment_id text DEFAULT NULL,
  p_signature text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_booking record;
  v_subscription uuid;
  v_payment uuid;
  v_queue uuid;
  v_lead uuid;
  v_cust_name text;
  v_cust_phone text;
  v_addr text;
  v_veh_label text;
BEGIN
  SELECT bk.*, sc.slug AS service_slug, sc.service_type, sc.name AS service_name, sc.category AS service_category
    INTO v_booking
    FROM public.bookings bk
    JOIN public.service_catalog sc ON sc.id = bk.service_id
    WHERE bk.id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF v_user IS NOT NULL AND v_booking.user_id <> v_user AND NOT public.has_role(v_user,'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.ensure_ops_customer_for_booking(p_booking_id);

  INSERT INTO public.payments(booking_id,user_id,provider,provider_order_id,provider_payment_id,amount,currency,status,metadata)
  VALUES (p_booking_id, v_booking.user_id,'razorpay',p_provider_order_id,p_provider_payment_id,
          v_booking.total_amount,'INR','captured',
          jsonb_build_object('service_slug',v_booking.service_slug) || COALESCE(p_raw_payload,'{}'::jsonb))
  ON CONFLICT (booking_id, provider) WHERE booking_id IS NOT NULL
  DO UPDATE SET provider_order_id=COALESCE(EXCLUDED.provider_order_id,public.payments.provider_order_id),
                provider_payment_id=COALESCE(EXCLUDED.provider_payment_id,public.payments.provider_payment_id),
                amount=EXCLUDED.amount, status='captured',
                metadata=public.payments.metadata||EXCLUDED.metadata, updated_at=now()
  RETURNING id INTO v_payment;

  INSERT INTO public.payment_transactions(payment_id,booking_id,user_id,provider,event_type,provider_order_id,provider_payment_id,signature,amount,status,raw_payload)
  VALUES(v_payment,p_booking_id,v_booking.user_id,'razorpay','payment.captured',p_provider_order_id,p_provider_payment_id,p_signature,v_booking.total_amount,'success',COALESCE(p_raw_payload,'{}'::jsonb));

  UPDATE public.bookings SET payment_status='paid', status='paid',
    razorpay_order_id=COALESCE(p_provider_order_id,razorpay_order_id),
    razorpay_payment_id=COALESCE(p_provider_payment_id,razorpay_payment_id),
    updated_at=now() WHERE id=p_booking_id;

  IF v_booking.service_category = 'subscription' OR v_booking.service_type='subscription' THEN
    INSERT INTO public.subscriptions(booking_id,user_id,customer_id,vehicle_id,plan_slug,status,start_date,renewal_date,service_start_date,amount,currency)
    VALUES(p_booking_id,v_booking.user_id,v_booking.user_id,v_booking.vehicle_id,v_booking.service_slug,'awaiting_partner_assignment',
           COALESCE(v_booking.scheduled_date,CURRENT_DATE),COALESCE(v_booking.scheduled_date,CURRENT_DATE)+30,
           COALESCE(v_booking.scheduled_date,CURRENT_DATE),v_booking.total_amount,'INR')
    ON CONFLICT(booking_id) DO UPDATE SET
      status=CASE WHEN public.subscriptions.status='assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
      start_date=EXCLUDED.start_date, renewal_date=EXCLUDED.renewal_date,
      service_start_date=EXCLUDED.service_start_date, amount=EXCLUDED.amount, updated_at=now()
    RETURNING id INTO v_subscription;

    SELECT public.enqueue_subscription_booking(p_booking_id) INTO v_queue;

    INSERT INTO public.customer_notifications(user_id,type,title,body,link,metadata)
    VALUES(v_booking.user_id,'subscription_paid','Daily Shine subscription active',
           'Your payment is complete. We are assigning your Urban Wash Partner now.','/c/subscriptions',
           jsonb_build_object('booking_id',p_booking_id,'subscription_id',v_subscription,'queue_id',v_queue));
  ELSE
    -- Non-subscription: create service lead for admin (NOT marketplace)
    SELECT cp.full_name, cp.phone INTO v_cust_name, v_cust_phone
      FROM public.customer_profiles cp WHERE cp.user_id = v_booking.user_id LIMIT 1;
    SELECT concat_ws(', ', address_line, area, pincode) INTO v_addr
      FROM public.customer_addresses WHERE id = v_booking.address_id;
    SELECT concat_ws(' ', make, model, '·', registration_number) INTO v_veh_label
      FROM public.customer_vehicles WHERE id = v_booking.vehicle_id;

    INSERT INTO public.service_leads(
      booking_id,user_id,customer_name,customer_phone,vehicle_id,vehicle_label,
      address_id,address_text,service_id,service_slug,service_name,service_category,
      price,payment_id,payment_status,scheduled_date,scheduled_time,status,metadata
    ) VALUES (
      p_booking_id, v_booking.user_id, v_cust_name, v_cust_phone,
      v_booking.vehicle_id, v_veh_label,
      v_booking.address_id, v_addr,
      v_booking.service_id, v_booking.service_slug, v_booking.service_name, v_booking.service_category,
      v_booking.total_amount, v_payment, 'paid',
      v_booking.scheduled_date, COALESCE(v_booking.scheduled_time, v_booking.preferred_before_time),
      'new', jsonb_build_object('source','payment')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_lead;

    INSERT INTO public.admin_alerts(type,title,body,severity,metadata)
    VALUES('service_lead','New service lead: '||v_booking.service_name,
           COALESCE(v_cust_name,'Customer')||' booked '||v_booking.service_name||' (₹'||v_booking.total_amount||')',
           'info', jsonb_build_object('lead_id',v_lead,'booking_id',p_booking_id));

    INSERT INTO public.customer_notifications(user_id,type,title,body,link,metadata)
    VALUES(v_booking.user_id,'booking_confirmed','Booking Confirmed',
           'Your booking has been successfully confirmed. Our team will contact you shortly.',
           '/c/bookings/'||p_booking_id,
           jsonb_build_object('booking_id',p_booking_id,'lead_id',v_lead));
  END IF;

  RETURN jsonb_build_object('ok',true,'booking_id',p_booking_id,'payment_id',v_payment,
                            'subscription_id',v_subscription,'queue_id',v_queue,'lead_id',v_lead);
END $$;

-- ============= 6. Admin RPCs for service leads =============
CREATE OR REPLACE FUNCTION public.admin_assign_lead(p_lead_id uuid, p_detailer_id uuid, p_detailer_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.service_leads SET assigned_detailer_id=p_detailer_id,
    assigned_detailer_name=p_detailer_name, assigned_at=now(),
    status=CASE WHEN status='new' THEN 'assigned' ELSE status END
    WHERE id=p_lead_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_lead(p_lead_id uuid, p_patch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.service_leads SET
    scheduled_date = COALESCE((p_patch->>'scheduled_date')::date, scheduled_date),
    scheduled_time = COALESCE(p_patch->>'scheduled_time', scheduled_time),
    notes = COALESCE(p_patch->>'notes', notes),
    status = COALESCE(p_patch->>'status', status)
  WHERE id = p_lead_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_lead(p_lead_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.service_leads SET status='cancelled', cancelled_at=now(), cancel_reason=p_reason WHERE id=p_lead_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_complete_lead(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.service_leads SET status='completed', completed_at=now() WHERE id=p_lead_id;
END $$;

-- ============= 7. RPC for customers to file add-on requests =============
CREATE OR REPLACE FUNCTION public.create_addon_request(
  p_subscription_id uuid, p_service_id uuid, p_preferred_date date, p_preferred_time text, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_user uuid := auth.uid();
  v_sub record; v_svc record; v_name text; v_phone text; v_veh text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE id=p_subscription_id AND user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  SELECT * INTO v_svc FROM public.service_catalog WHERE id=p_service_id;
  SELECT full_name, phone INTO v_name, v_phone FROM public.customer_profiles WHERE user_id=v_user LIMIT 1;
  SELECT concat_ws(' ', make, model) INTO v_veh FROM public.customer_vehicles WHERE id=v_sub.vehicle_id;

  INSERT INTO public.subscription_addon_requests(
    subscription_id,user_id,customer_name,customer_phone,vehicle_id,vehicle_label,
    service_id,service_name,service_slug,preferred_date,preferred_time,notes,status
  ) VALUES (
    p_subscription_id,v_user,v_name,v_phone,v_sub.vehicle_id,v_veh,
    p_service_id,v_svc.name,v_svc.slug,p_preferred_date,p_preferred_time,p_notes,'new'
  ) RETURNING id INTO v_id;

  INSERT INTO public.admin_alerts(type,title,body,severity,metadata)
  VALUES('addon_request','Add-on requested: '||v_svc.name,
         COALESCE(v_name,'Customer')||' requested '||v_svc.name,
         'info', jsonb_build_object('addon_id',v_id,'subscription_id',p_subscription_id));
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_assign_lead(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lead(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_lead(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_addon_request(uuid,uuid,date,text,text) TO authenticated;
