
CREATE TABLE public.plan_inclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_slug text NOT NULL,
  title text NOT NULL,
  description text,
  icon text,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_inclusions_plan_order ON public.plan_inclusions(plan_slug, display_order);

GRANT SELECT ON public.plan_inclusions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plan_inclusions TO authenticated;
GRANT ALL ON public.plan_inclusions TO service_role;

ALTER TABLE public.plan_inclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_inclusions: public read active"
  ON public.plan_inclusions FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "plan_inclusions: admin write"
  ON public.plan_inclusions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_plan_inclusions_updated_at
  BEFORE UPDATE ON public.plan_inclusions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.plan_inclusions (plan_slug, title, icon, display_order) VALUES
  ('daily-shine', '26 Days Daily Exterior Chemical Cleaning', 'droplets', 10),
  ('daily-shine', '1 Premium Interior Cleaning',             'wrench',   20),
  ('daily-shine', '1 Hydrophobic Exterior Pressure Wash',    'shield',   30),
  ('daily-shine', 'Tyre Polish',                              'sparkles', 40),
  ('daily-shine', 'Paper Mats',                               'car',      50),
  ('daily-shine', 'Fragrance Spray',                          'spray-can',60),
  ('daily-shine-exterior', '26 Days Daily Exterior Chemical Cleaning', 'droplets', 10),
  ('daily-shine-interior', 'Premium Interior Cleaning',                'wrench',   10),
  ('daily-shine-dusting',  'Daily Dusting Touch-up',                   'sparkles', 10);

ALTER TABLE public.customer_notifications
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.customer_vehicles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_notifications_vehicle ON public.customer_notifications(vehicle_id);

CREATE OR REPLACE FUNCTION public.list_my_recent_services(p_days integer DEFAULT 2, p_vehicle_id uuid DEFAULT NULL)
 RETURNS TABLE(service_id uuid, booking_id uuid, scheduled_date date, completed_at timestamp with time zone, status text, service_name text, service_slug text, partner_id uuid, partner_name text, vehicle_label text, photos jsonb, unavailable_reason text, unavailable_notes text, unavailable_photo text, dirty_report jsonb, complaint_window_ends_at timestamp with time zone, can_complain boolean, has_complaint boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, b.id, s.scheduled_date,
    COALESCE(s.completed_at, s.updated_at),
    s.status::text, sc.name, sc.slug, s.partner_id, p.full_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage, 'angle', sp.angle,
        'storage_path', sp.storage_path, 'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp WHERE sp.service_id = s.id
    ), '[]'::jsonb),
    s.unavailable_reason::text, s.unavailable_notes, s.unavailable_photo,
    (
      SELECT jsonb_build_object(
        'reason', dr.reason, 'notes', dr.notes,
        'photo_front', dr.photo_front, 'photo_rear', dr.photo_rear,
        'photo_left', dr.photo_left, 'photo_right', dr.photo_right,
        'created_at', dr.created_at
      )
      FROM public.dirty_vehicle_reports dr
      WHERE dr.service_id = s.id
      ORDER BY dr.created_at DESC LIMIT 1
    ),
    (COALESCE(s.completed_at, s.updated_at) + interval '2 hours'),
    (s.status = 'completed' AND s.completed_at IS NOT NULL AND s.completed_at > now() - interval '2 hours'),
    EXISTS (SELECT 1 FROM public.complaints c WHERE c.service_id = s.id)
  FROM public.services s
  JOIN public.bookings b ON b.ops_service_id = s.id
  LEFT JOIN public.service_catalog sc ON sc.id = b.service_id
  LEFT JOIN public.partners p ON p.id = s.partner_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  WHERE b.user_id = auth.uid()
    AND s.status IN ('completed','unavailable')
    AND COALESCE(s.completed_at, s.updated_at) > now() - (p_days || ' days')::interval
    AND (p_vehicle_id IS NULL OR b.vehicle_id = p_vehicle_id)
  ORDER BY COALESCE(s.completed_at, s.updated_at) DESC
  LIMIT 30;
$function$;
