# Plan: Assignment Cancellation Re-broadcast and Notifications

Complete the notification and marketplace UX for the assignment cancellation feature. Ensures unstarted work is released to the marketplace and eligible partners are notified immediately with dynamic earnings and distance.

## User Review Required
> [!IMPORTANT]
> - Notification delivery depends on valid FCM tokens.
> - Parallel fan-out is optimized for speed (2-3s target).
> - Exclusion logic ensures the cancelling partner doesn't get their own work back immediately.

## Proposed Changes

### Core Logic & Backend
#### [NEW] `src/lib/push/resolvers.server.ts`
- Enhance `resolvePartnerMonthlyEarning` to handle total sums for multiple released vehicles.
- Ensure 26-day cycle calculation matches canonical business rules.

#### `src/lib/push/dispatch.server.ts`
- Add `assignment_released` to `PARTNER_ASSIGNMENT_TYPES`.
- Implement `dispatchAssignmentReleased` function:
  - Parallel fan-out to all eligible partners.
  - Exclude the cancelling partner.
  - Dynamically resolve monthly earnings and partner-specific distance.
  - Inject forensic markers: `[RELEASED-WORK-PUSH:01-06]`.

#### `src/lib/push/send.server.ts`
- Update `sendOfferPush` to support `assignment_released` type and specialized payloads.

### UI/UX Improvements
#### `src/components/partner/MarketplaceOfferCard.tsx`
- Add specific rendering for `assignment_released` type.
- Show "NEW WORK AVAILABLE" with customer count and monthly potential prominently.
- Ensure "View Customers" reveals the specific vehicles/customers.

#### `src/routes/_authenticated/app.assignments.tsx`
- Ensure real-time updates via Supabase channel (already partially implemented via `MarketplaceOffersList`).
- Refine summary card to highlight potential monthly earnings.

### Native Integration
#### Kotlin (`UrbanwashMessagingService.kt`)
- Note: Requires native build (Build 07/08) to recognize `assignment_released`.
- Add forensic markers: `[CUSTOMER-PUSH-NATIVE:03-05]`.

## Technical Details
- **FCM Payload**: type, broadcast_id, assignment_id, customer_count, monthly_earnings, area, distance_km, title, body, action_token.
- **Monthly Earnings Formula**: `SUM(daily_rate * working_days_in_cycle)`.
- **Atomic Claims**: Reuse `mp_accept_offer` to prevent race conditions.
- **Forensic Logs**: Standardized markers for end-to-end tracing.

## Verification Plan
### Automated Tests
- Trigger `cancel_assignment` RPC via subagent/exec.
- Verify forensic logs show `FANOUT_STARTED` and `FCM_SENT`.
- Check `offer_delivery_events` for correct recipient count and success/failure.

### Manual Verification
- Partner A cancels assignment.
- Partner B receives high-priority notification.
- Partner B views "Available Work" and sees the exact customer count/earnings.
- Partner B successfully claims the work.
