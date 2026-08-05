create or replace function public.guard_booking_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted internal routines run inside SECURITY DEFINER functions owned by
  -- the database owner, so current_user is no longer the API request role.
  -- Direct Data API writes from the app run as anon/authenticated.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

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