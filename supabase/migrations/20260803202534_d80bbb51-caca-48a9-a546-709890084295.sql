
insert into public.service_catalog (slug, name, description, service_type, category, price_hatchback, price_sedan_suv, active)
values
  ('monthly-addon-extra-exterior','Extra Exterior Wash','+1 exterior wash every month','one_time','addon',149,149,true),
  ('monthly-addon-extra-interior','Extra Interior Wash','+1 interior wash every month','one_time','addon',199,199,true),
  ('monthly-addon-extra-both','Extra Interior & Exterior','+1 of each every month','one_time','addon',299,299,true)
on conflict (slug) do nothing;

alter table public.subscription_monthly_addons
  add column if not exists payment_status text not null default 'pending',
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists activated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sma_payment_status_check') then
    alter table public.subscription_monthly_addons
      add constraint sma_payment_status_check check (payment_status in ('pending','paid','failed','cancelled'));
  end if;
end $$;

update public.subscription_monthly_addons
set payment_status = 'paid', activated_at = coalesce(activated_at, added_at)
where is_active = true and payment_status = 'pending' and booking_id is null;

create index if not exists idx_sma_booking on public.subscription_monthly_addons(booking_id);

create or replace function public.create_monthly_addon_checkout(
  p_subscription_id uuid,
  p_addon_type text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
  v_slug text;
  v_service record;
  v_price numeric;
  v_booking_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_sub from public.subscriptions
  where id = p_subscription_id and user_id = v_uid;
  if v_sub is null then
    raise exception 'Subscription not found';
  end if;
  if v_sub.status not in ('active','awaiting_partner_assignment','assigned') then
    raise exception 'Your plan must be active before adding monthly add-ons';
  end if;

  v_slug := case p_addon_type
    when 'extra_exterior' then 'monthly-addon-extra-exterior'
    when 'extra_interior' then 'monthly-addon-extra-interior'
    when 'extra_both' then 'monthly-addon-extra-both'
    else null end;
  if v_slug is null then
    raise exception 'Unknown add-on';
  end if;

  select * into v_service from public.service_catalog where slug = v_slug;
  if v_service is null then
    raise exception 'Add-on service is unavailable';
  end if;
  v_price := v_service.price_hatchback;

  if exists (
    select 1 from public.subscription_monthly_addons
    where subscription_id = p_subscription_id
      and addon_type = p_addon_type
      and (is_active = true or payment_status = 'pending')
      and removed_at is null
  ) then
    raise exception 'This add-on is already added or awaiting payment';
  end if;

  insert into public.bookings (
    user_id, service_id, vehicle_id, status, payment_status,
    base_amount, addon_amount, discount_amount, total_amount, notes
  ) values (
    v_uid, v_service.id, v_sub.vehicle_id, 'pending_payment', 'pending',
    v_price, 0, 0, v_price, 'Monthly add-on: ' || v_service.name
  ) returning id into v_booking_id;

  insert into public.subscription_monthly_addons (
    subscription_id, user_id, addon_type, quantity, monthly_price,
    is_active, payment_status, booking_id
  ) values (
    p_subscription_id, v_uid, p_addon_type, 1, v_price,
    false, 'pending', v_booking_id
  );

  return v_booking_id;
end;
$$;

grant execute on function public.create_monthly_addon_checkout(uuid, text) to authenticated;

create or replace function public.activate_monthly_addon_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid' and coalesce(old.payment_status,'') <> 'paid' then
    update public.subscription_monthly_addons
    set is_active = true,
        payment_status = 'paid',
        activated_at = now(),
        updated_at = now()
    where booking_id = new.id and payment_status <> 'paid';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activate_monthly_addon_on_payment on public.bookings;
create trigger trg_activate_monthly_addon_on_payment
after update of payment_status on public.bookings
for each row execute function public.activate_monthly_addon_on_payment();

create or replace function public.guard_booking_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if new.payment_status is distinct from old.payment_status
     or new.total_amount is distinct from old.total_amount
     or new.base_amount is distinct from old.base_amount
     or new.addon_amount is distinct from old.addon_amount
     or new.discount_amount is distinct from old.discount_amount
     or new.coupon_code is distinct from old.coupon_code
     or new.razorpay_order_id is distinct from old.razorpay_order_id
     or new.razorpay_payment_id is distinct from old.razorpay_payment_id
     or new.partner_id is distinct from old.partner_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Payment and pricing fields can only be changed by Urban Wash';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_booking_owner_update on public.bookings;
create trigger trg_guard_booking_owner_update
before update on public.bookings
for each row execute function public.guard_booking_owner_update();

create or replace function public.guard_vehicle_discount_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if new.discount_approved is distinct from old.discount_approved
     or new.discount_approved_by is distinct from old.discount_approved_by
     or new.discount_approved_at is distinct from old.discount_approved_at then
    raise exception 'Discount approval can only be changed by Urban Wash staff';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_vehicle_discount_fields on public.customer_vehicles;
create trigger trg_guard_vehicle_discount_fields
before update on public.customer_vehicles
for each row execute function public.guard_vehicle_discount_fields();
