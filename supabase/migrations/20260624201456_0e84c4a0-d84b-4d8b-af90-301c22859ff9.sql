CREATE OR REPLACE FUNCTION public.tg_enqueue_subscription_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text;
  v_slug text;
BEGIN
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    SELECT service_type, slug INTO v_type, v_slug FROM public.service_catalog WHERE id = NEW.service_id;
    IF v_type = 'subscription' THEN
      PERFORM public.ensure_ops_customer_for_booking(NEW.id);
      INSERT INTO public.subscriptions (
        booking_id, user_id, customer_id, vehicle_id, plan_slug, status, start_date, renewal_date, service_start_date, amount, currency
      ) VALUES (
        NEW.id, NEW.user_id, NEW.user_id, NEW.vehicle_id, COALESCE(v_slug, 'daily-shine'), 'awaiting_partner_assignment',
        COALESCE(NEW.scheduled_date, CURRENT_DATE), COALESCE(NEW.scheduled_date, CURRENT_DATE) + 30,
        COALESCE(NEW.scheduled_date, CURRENT_DATE), NEW.total_amount, 'INR'
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        status = CASE WHEN public.subscriptions.status = 'assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
        start_date = EXCLUDED.start_date,
        renewal_date = EXCLUDED.renewal_date,
        service_start_date = EXCLUDED.service_start_date,
        amount = EXCLUDED.amount,
        updated_at = now();
      PERFORM public.enqueue_subscription_booking(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;