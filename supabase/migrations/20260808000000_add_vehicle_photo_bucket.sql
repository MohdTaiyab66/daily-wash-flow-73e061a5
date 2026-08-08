-- 1. Create storage bucket for vehicle photos
insert into storage.buckets (id, name, public)
values ('vehicle-images', 'vehicle-images', false)
on conflict (id) do nothing;

-- 2. Storage Policies for 'vehicle-images'
-- Customers can upload/manage their own vehicle images
create policy "Customers can upload vehicle images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vehicle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Customers can update their own vehicle images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'vehicle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Customers can delete their own vehicle images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vehicle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Customers can view their own vehicle images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'vehicle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Partners can view vehicle images for their assignments
-- Since partners need to identify the vehicle, we grant select access to authenticated users with 'partner' role (if we had a role check here)
-- For now, let's allow authenticated users to select if they are referenced via a service/booking.
-- A simpler approach for the Partner is a security definer function or a policy that checks if the user is a partner assigned to a booking for this vehicle.

create policy "Partners can view assigned vehicle images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'vehicle-images' AND
  EXISTS (
    select 1 from public.services s
    join public.customer_vehicles v on s.vehicle_id = v.id
    where v.image_path = name
      and s.partner_id = auth.uid()
  )
);
