# Plan - Fix RPC Blocking and Stale Payment States

The root cause of the "This vehicle already has an active Daily Shine subscription" error is a strict check in `confirm_customer_booking` that doesn't distinguish between a fully paid active subscription and a stale or failed payment attempt. We will refine this logic to ensure only verified, paid-up subscriptions block new ones, while also cleaning up any failed payment records to allow the customer to proceed.

## User Review Required

> [!IMPORTANT]
> We are making the "duplicate subscription" check more precise. If a previous payment failed or was cancelled, it will no longer block a new attempt for the same vehicle.

- Do you have any specific vehicles currently stuck that you would like me to manually clear, or should I rely on the automated cleanup script?

## Proposed Changes

### Database (Supabase)

#### 1. Refine `confirm_customer_booking` RPC
- Update the duplicate subscription check to exclude subscriptions tied to unpaid bookings.
- Ensure the check only triggers for `service_type = 'subscription'`.

#### 2. Create Cleanup Script
- Add a migration to move any existing `awaiting_partner_assignment` subscriptions with `unpaid` bookings to a `cancelled` or `payment_failed` state.

#### 3. Payment State Machine Reinforcement
- Explicitly check `payment_status = 'paid'` in the duplicate verification logic.

## Technical Details

### SQL Changes
```sql
-- In confirm_customer_booking
SELECT s.id INTO v_dup_sub_id
FROM public.subscriptions s
JOIN public.bookings b ON b.id = s.booking_id
WHERE s.vehicle_id = p_vehicle_id
  AND s.status IN ('active','awaiting_partner_assignment','assigned')
  AND b.payment_status = 'paid' -- Only block if actually paid
LIMIT 1;
```

### Verification Plan
- **Pre-verification**: I will check for any existing subscriptions in the database for the test user/vehicle that might be blocking the flow.
- **Post-verification**: I will simulate the `confirm_customer_booking` RPC call with a test vehicle to ensure it no longer returns `P0DUP` for unpaid attempts.
