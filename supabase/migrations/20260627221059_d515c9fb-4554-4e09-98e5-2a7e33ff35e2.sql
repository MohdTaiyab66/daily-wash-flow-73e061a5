DROP FUNCTION IF EXISTS public.admin_route_reassign(uuid,uuid,integer,text);

CREATE OR REPLACE FUNCTION public.admin_route_remove_stop(p_service_id uuid, p_mode text, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_svc record;
BEGIN
  IF NOT public.is_admin_or_ops(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_mode NOT IN ('today_only','cancel') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  SELECT id,partner_id,scheduled_date,status,customer_id INTO v_svc FROM public.services WHERE id=p_service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'service not found'; END IF;

  IF p_mode = 'today_only' THEN
    UPDATE public.services SET partner_id=NULL, sequence_no=NULL, manual_sequence_no=NULL,
      last_sequence_change_at=now(), last_sequence_change_by=v_uid WHERE id=p_service_id;
  ELSE
    UPDATE public.services SET status='skipped'::service_status,
      delay_reason=COALESCE(p_reason,'Cancelled by operations'),
      last_sequence_change_at=now(), last_sequence_change_by=v_uid WHERE id=p_service_id;
  END IF;

  INSERT INTO public.route_change_log(partner_id,service_id,date,actor_id,action,reason,old_value,new_value)
  VALUES(v_svc.partner_id,p_service_id,v_svc.scheduled_date,v_uid,'remove_'||p_mode,p_reason,
         jsonb_build_object('status',v_svc.status,'partner_id',v_svc.partner_id),
         jsonb_build_object('mode',p_mode));

  IF v_svc.partner_id IS NOT NULL THEN
    INSERT INTO public.partner_notifications(partner_id,type,title,body,link,metadata)
    VALUES(v_svc.partner_id,'route_updated','Route updated by Operations',
           'A stop was removed from your route.','/app/live',
           jsonb_build_object('service_id',p_service_id,'mode',p_mode));
  END IF;
  RETURN jsonb_build_object('ok',true);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_route_reassign(p_service_id uuid, p_to_partner uuid, p_position integer DEFAULT NULL::integer, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_actor uuid := auth.uid(); v_from_partner uuid; v_date date;
BEGIN
  IF NOT public.is_admin_or_ops(v_actor) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT partner_id, scheduled_date INTO v_from_partner, v_date FROM public.services WHERE id = p_service_id;
  IF v_date IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;

  UPDATE public.services
     SET partner_id = p_to_partner,
         reassigned_from = v_from_partner,
         sequence_no = p_position,
         manual_sequence_no = p_position,
         last_sequence_change_at = now(),
         last_sequence_change_by = v_actor,
         updated_at = now()
   WHERE id = p_service_id;

  INSERT INTO public.route_change_log(partner_id, service_id, date, actor_id, action, reason, old_value, new_value)
  VALUES (p_to_partner, p_service_id, v_date, v_actor, 'reassign', p_reason,
          jsonb_build_object('from_partner', v_from_partner),
          jsonb_build_object('to_partner', p_to_partner, 'position', p_position));

  IF v_from_partner IS NOT NULL AND v_from_partner <> p_to_partner THEN
    INSERT INTO public.partner_notifications(partner_id,type,title,body,link,metadata)
    VALUES(v_from_partner,'route_updated','Route updated by Operations',
           'A stop was reassigned to another partner.','/app/live',
           jsonb_build_object('service_id',p_service_id,'date',v_date));
  END IF;
  INSERT INTO public.partner_notifications(partner_id,type,title,body,link,metadata)
  VALUES(p_to_partner,'route_updated','New stop added to your route',
         COALESCE(p_reason,'A new customer was added to your route.'),'/app/live',
         jsonb_build_object('service_id',p_service_id,'date',v_date,'position',p_position));

  RETURN jsonb_build_object('ok',true,'from_partner',v_from_partner,'to_partner',p_to_partner,'position',p_position);
END $function$;