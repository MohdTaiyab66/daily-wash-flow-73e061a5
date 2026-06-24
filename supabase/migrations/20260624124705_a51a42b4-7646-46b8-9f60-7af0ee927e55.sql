REVOKE EXECUTE ON FUNCTION public.list_my_recent_services(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_service_complaint(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_booking_from_service_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_service_photo_url(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_plan_services_recurring(uuid, uuid, uuid, integer, integer, date, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_my_recent_services(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_service_complaint(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_service_photo_url(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_plan_services_recurring(uuid, uuid, uuid, integer, integer, date, text) TO authenticated;