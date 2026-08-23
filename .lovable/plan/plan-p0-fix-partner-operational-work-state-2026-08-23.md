# Plan: P0 — Fix Partner Operational Work State

Identify and fix the root cause where assignments are committed but don't appear in the Partner App UI due to booking-to-service link divergence.

## User Review Required

> [!IMPORTANT]
> The issue is a "Link Divergence": The database successfully creates the assignment and updates today's service record, but the user's booking still points to a historical service. Because the UI query strictly joins bookings via their `ops_service_id`, today's work is hidden even though it exists.

## Proposed Changes

### Database Functions

#### 1. Fix `admin_assign_partner_to_booking`
- Ensure `public.bookings.ops_service_id` is updated to point to `v_service_id` regardless of whether the service was newly created or found as an existing pending record.
- This guarantees that the booking and the operational service for today are correctly linked.

#### 2. Improve `get_partner_work`
- Make the join between `services` and `bookings` more robust.
- Primary join: `s.id = b.ops_service_id`.
- Fallback/Verification: Join by `vehicle_id` and `customer_id` if the `ops_service_id` is mismatched but the service is for today's IST date.

### Frontend

#### 3. Update Landing Page Footer (`src/routes/index.tsx`)
- Replace the diagnostic text with the new P0 requirements and final forensic report as requested.
- State exactly ONE: **B. Assignment committed but Partner Work query returns 0**.

## Verification Plan

### Automated Tests
- Create a fresh booking for a non-Deepak partner (e.g., Mohd Atif).
- Call `admin_assign_partner_to_booking`.
- Verify in SQL that `assignments` row exists, `services.assignment_id` is set, AND `bookings.ops_service_id` matches the service.
- Call `get_partner_work` and verify it returns 1 row.

### Manual Verification
- Verify the Partner App UI (Home, Route, Earnings) updates correctly for the assigned partner.
