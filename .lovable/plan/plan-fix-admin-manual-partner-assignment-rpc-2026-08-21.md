# Plan: Fix Admin Manual Partner Assignment RPC

Redefine the `admin_assign_partner_to_booking` SQL function to replace the nonexistent `partner_profiles` table with the authoritative `partners` table and fix the logic for linking bookings, subscriptions, and services.

## Technical Details

### 1. Database Migration
- Create a new migration `supabase/migrations/20260822000000_fix_admin_assignment_rpc.sql`.
- Redefine `public.admin_assign_partner_to_booking` with the following changes:
    - Replace `public.partner_profiles` with `public.partners`.
    - Map `partner_profiles.user_id` to `partners.id`.
    - Fix the `UPDATE public.services` statement to use `id = v_booking.ops_service_id` instead of the nonexistent `booking_id` column.
    - Add logic to handle fresh subscription bookings: create an `assignments` record and a `services` record if they don't exist.
    - Update `public.subscriptions` status to `active` and link the partner.
    - Fix notification inserts to use correct column names (e.g., `user_id` in `customer_notifications`).

### 2. Implementation Logic
- **Atomicity**: The function will run in a single transaction.
- **Resilience**: If push notifications fail to generate rows (e.g., missing data), the assignment will still proceed if possible, but the current RPC structure using `INSERT` statements will roll back the whole transaction if any insert fails. I will wrap the notification logic to be more resilient if needed, though standard SQL inserts are usually safe if the data is validated.
- **State Updates**:
    - `bookings.status` -> `'assigned'`
    - `bookings.partner_id` -> `p_partner_id`
    - `subscriptions.status` -> `'active'`
    - `services.status` -> `'pending'` (if just created)

## Verification Plan
1. Apply the migration using `psql`.
2. Verify the function definition in the database.
3. The user will perform the P0 verification test with booking `5c4ecb85-c6cb-4c14-b09c-8fa454a0e270`.
