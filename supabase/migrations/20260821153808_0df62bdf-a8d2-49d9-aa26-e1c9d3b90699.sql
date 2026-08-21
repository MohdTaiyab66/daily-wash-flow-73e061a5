-- Revoke default public execute permission
REVOKE EXECUTE ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid, uuid) FROM anon;

-- Grant to service_role (for our server functions)
GRANT EXECUTE ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid, uuid) TO service_role;