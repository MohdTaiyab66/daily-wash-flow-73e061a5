# Plan - P0 Final Fix: Admin Manual Partner Assignment

Fix the backend assignment RPC and partner list resolution by removing references to the nonexistent `partner_profiles` table and using the canonical `partners` table.

## User Review Required

> [!IMPORTANT]
> The error `relation "public.partner_profiles" does not exist` confirms that the database `admin_assign_partner_to_booking` function (and potentially others) is referencing an old table schema. I will migrate these to the authoritative `partners` table.

- **Authoritative Partner Source**: `public.partners` (renamed from `partner_profiles` in earlier migrations but not fully propagated).
- **Partner ID Field**: `id` (matches `auth.users.id`).
- **Partner Area Field**: `home_area`.

## Proposed Changes

### Database (PostgreSQL)

#### 1. Fix `admin_assign_partner_to_booking` RPC
- Replace all references to `public.partner_profiles` with `public.partners`.
- Update `WHERE user_id = p_partner_id` to `WHERE id = p_partner_id`.
- Ensure atomic updates to `bookings` and `services`.
- Wrap notification inserts in the same transaction but ensure they don't roll back the core assignment if push delivery (external) fails later.

#### 2. Audit and Fix Secondary References
- Search for and fix any other functions or triggers referencing `partner_profiles` found during forensic search:
  - `mp_reconcile_all_partners_for_broadcast` (already noted as potentially fixed but needs verification).
  - Any others identified in `supabase/migrations/`.

### Frontend & Server Functions

#### 1. Fix Partner List Resolution (`src/lib/admin.functions.ts`)
- Verify `listAdminPartnersBrief` and `listAdminPartners` query the correct `partners` table and `home_area` field.
- Ensure the "No area" display in UI is backed by correct data resolution.

#### 2. Verification
- Verify that `bookings.id` matches the ID used in the assignment flow.
- Confirm successful assignment for booking `5c4ecb85-c6cb-4c14-b09c-8fa454a0e270`.

## Technical Details

- **Database Migration**: A new migration file will be created to redefine the `admin_assign_partner_to_booking` function.
- **RLS**: The server function `adminAssignPartnerToBooking` uses `supabaseAdmin`, bypassing RLS, which is correct for administrative overrides.
- **Notification Chain**: The RPC handles row insertion for notifications; actual push dispatch happens in the server function's `.handler` via `flushNotificationPush()`.

## Verification Plan

1. **Automated Check**: Run `rg "partner_profiles"` after changes to ensure zero references remain in the codebase.
2. **Manual Test**: Click "Assign Partner" on the Admin dashboard for a paid booking and verify:
   - Success toast appears.
   - Redirect to notifications occurs.
   - Database record `bookings.partner_id` is updated.
   - `assignments` record is created.
