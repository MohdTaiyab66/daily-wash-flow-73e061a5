# Plan - Partner App Realtime Assignment Sync Fix

The Partner App is currently not updating immediately when an Admin manually assigns a partner. This plan ensures that the assigned Partner App reflects the new assignment across all screens (Home, Live Route, Map, Earnings) without requiring a manual refresh.

## User Review Required

> [!IMPORTANT]
> This fix relies on Supabase Realtime and TanStack Query invalidation. If FCM (Push) fails, the app will still sync within ~2-15 seconds of the database change.

## Proposed Changes

### Database Logic (Supabase)
- **admin_assign_partner_to_booking RPC**:
    - Update to use `new_assignment` notification type (matching Partner App's realtime listener).
    - Include full metadata: `booking_id`, `service_id`, `assignment_id`, `vehicle_id`, and `partner_id`.
    - Ensure atomic insertion into `partner_notifications`.

### Partner App (Frontend)
- **Immediate Query Invalidation**:
    - Update the global realtime listener in `src/routes/_authenticated/app.tsx` to watch for `new_assignment` notification types.
    - When a `new_assignment` notification is detected, immediately invalidate:
        - `today-assignment` (Home counts, earnings)
        - `route-today` (Daily Route list)
        - `partner-notifications-unread` (Badge)
        - `partner-open-offers-home` (Marketplace cleanup)
- **Live Route UI**:
    - Ensure `useRealtimeInvalidation` in `src/routes/_authenticated/app.live.tsx` is correctly wired to the `services` and `assignments` tables for deep reactivity.

## Technical Details
- **RPC Redefinition**: Migration file `supabase/migrations/20260822000001_p0_fix_assignment_sync.sql` already staged.
- **Client Sync**: Modifying `src/routes/_authenticated/app.tsx` to handle the `new_assignment` realtime event.
- **Service Propagation**: Verification that `services.assignment_id` and `services.partner_id` are set correctly to allow `useTodayAssignment` to fetch the new rows.

## Verification Plan
1. **Automated Check**: Verify RPC signature and notification type mapping.
2. **Manual E2E**:
    - Customer books Daily Shine.
    - Admin assigns Partner.
    - Observe Partner App Home/Route updates without manual refresh.
    - Verify Partner notification appears in the bell icon.
