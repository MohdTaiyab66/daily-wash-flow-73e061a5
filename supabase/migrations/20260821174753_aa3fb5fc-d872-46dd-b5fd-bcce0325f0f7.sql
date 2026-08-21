CREATE OR REPLACE VIEW public.admin_booking_details AS
SELECT 
    b.*,
    c.full_name as customer_name,
    c.phone as customer_phone,
    c.area as customer_area,
    c.address_line as customer_address,
    sc.name as service_name,
    sc.category as service_category
FROM public.bookings b
LEFT JOIN public.customers c ON b.user_id = c.id
LEFT JOIN public.service_catalog sc ON b.service_id = sc.id;

GRANT SELECT ON public.admin_booking_details TO authenticated;
GRANT ALL ON public.admin_booking_details TO service_role;
