
-- =========================================================================
-- Phase 3 Observation Repair — shadow telemetry only
-- Non-destructive to production tables. No changes to bookings, subscriptions,
-- services, assignments, offers, notifications, or FCM dispatch.
-- =========================================================================

-- 1) Drop the obsolete 8-arg overload so ds_log_event() has a single
--    unambiguous implementation. The 12-arg overload becomes the sole target;
--    all 7-11 positional callers continue to bind via defaulted args.
DROP FUNCTION IF EXISTS public.ds_log_event(uuid,text,text,text,uuid,text,jsonb,text);

-- 2) Rewrap every legacy mirror trigger body in an EXCEPTION guard.
--    A shadow telemetry error must NEVER abort a legacy production write.
--    On error we pg_notify('shadow_pipeline_error', ...) and swallow.

CREATE OR REPLACE FUNCTION public.mirror_legacy_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  BEGIN
    IF TG_OP='INSERT' THEN
      PERFORM public.ds_log_event(NEW.id,'booking_created','legacy','trg_mirror_bookings',NEW.id,'ok',
        jsonb_build_object('payment_status',NEW.payment_status,'status',NEW.status));
    ELSIF TG_OP='UPDATE'
      AND COALESCE(OLD.payment_status,'') IS DISTINCT FROM COALESCE(NEW.payment_status,'')
      AND NEW.payment_status='paid' THEN
      PERFORM public.ds_log_event(NEW.id,'payment_verified','legacy','trg_mirror_bookings',NEW.id,'ok',
        jsonb_build_object('razorpay_payment_id',NEW.razorpay_payment_id));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','bookings','booking_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.mirror_legacy_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_booking uuid;
BEGIN
  BEGIN
    BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
    IF TG_OP='INSERT' THEN
      PERFORM public.ds_log_event(v_booking,'subscription_activated','legacy','trg_mirror_subscriptions',
        NEW.id,'ok',to_jsonb(NEW),NULL,NULL,NEW.id,NULL,NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','subscriptions','row_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.mirror_legacy_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_booking uuid;
BEGIN
  BEGIN
    BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
    PERFORM public.ds_log_event(v_booking,'offer_created','legacy','trg_mirror_subscription_offers',
      NEW.id,'ok',to_jsonb(NEW));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','subscription_offers','row_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.mirror_legacy_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_booking uuid;
BEGIN
  BEGIN
    BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
    PERFORM public.ds_log_event(v_booking,'assignment_created','legacy','trg_mirror_assignments',
      NEW.id,'ok',to_jsonb(NEW));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','assignments','row_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.mirror_legacy_assignment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_booking uuid;
BEGIN
  BEGIN
    BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
    IF (OLD IS DISTINCT FROM NEW) THEN
      PERFORM public.ds_log_event(v_booking,'route_updated','legacy','trg_mirror_assignments_update',
        NEW.id,'ok',jsonb_build_object('old_status',OLD.status,'new_status',NEW.status),
        NULL,NULL,NULL,NEW.id,NEW.partner_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','assignments','row_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.mirror_legacy_service()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_booking uuid;
  v_completed boolean := false;
BEGIN
  BEGIN
    BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
    IF TG_OP='INSERT' THEN
      PERFORM public.ds_log_event(v_booking,'service_generated','legacy','trg_mirror_services',
        NEW.id,'ok',to_jsonb(NEW));
    ELSIF TG_OP='UPDATE' THEN
      BEGIN
        v_completed := (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status='completed';
      EXCEPTION WHEN undefined_column THEN v_completed := false; END;
      IF v_completed THEN
        PERFORM public.ds_log_event(v_booking,'service_completed','legacy','trg_mirror_services',
          NEW.id,'ok',to_jsonb(NEW));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','services','row_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.mirror_legacy_partner_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_booking uuid;
BEGIN
  BEGIN
    BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
    PERFORM public.ds_log_event(v_booking,'notification_partner','legacy','trg_mirror_partner_notifications',
      NEW.id,'ok',to_jsonb(NEW));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('shadow_pipeline_error', json_build_object(
      'trigger',TG_NAME,'table','partner_notifications','row_id',NEW.id,
      'sqlstate',SQLSTATE,'error',SQLERRM)::text);
  END;
  RETURN NEW;
END;$fn$;
