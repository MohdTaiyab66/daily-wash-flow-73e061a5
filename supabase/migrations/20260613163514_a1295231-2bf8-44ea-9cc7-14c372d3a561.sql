DROP VIEW IF EXISTS public.v_live_ops_today;
CREATE VIEW public.v_live_ops_today WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND partner_id IS NOT NULL) AS assigned_today,
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND status='completed') AS completed_today,
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND status IN ('pending','in_progress')) AS pending_today,
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND status='unavailable') AS unavailable_today,
  (SELECT count(*) FROM dirty_vehicle_reports WHERE created_at::date = CURRENT_DATE) AS dirty_today,
  (SELECT count(*) FROM parking_reports WHERE created_at::date = CURRENT_DATE) AS parking_today,
  (SELECT count(*) FROM services WHERE fraud_review = true AND scheduled_date >= CURRENT_DATE - 7) AS fraud_flags_week;

GRANT SELECT ON public.v_live_ops_today TO authenticated, service_role;