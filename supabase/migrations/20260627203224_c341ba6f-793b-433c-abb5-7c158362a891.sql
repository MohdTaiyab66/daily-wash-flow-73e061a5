
REVOKE EXECUTE ON FUNCTION public.tg_block_forbidden_customer_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_customer_service_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_customer_dirty_report() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_notify_customer_unavailable_report() FROM PUBLIC, anon, authenticated;
