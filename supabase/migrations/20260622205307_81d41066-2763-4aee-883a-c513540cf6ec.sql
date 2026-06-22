REVOKE ALL ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.notify_partners_new_booking() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_partners_new_booking() FROM anon;
REVOKE ALL ON FUNCTION public.notify_partners_new_booking() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_partners_new_booking() TO service_role;