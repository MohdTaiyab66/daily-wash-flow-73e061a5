# E2E Fix: Service Days & Unavailable Submission

Fixing the service days progress mismatch and the unavailable vehicle submission pipeline to ensure data consistency and reliability across Partner and Customer apps.

## Root Cause Analysis
1.  **Service Days Mismatch**: The "22 days left" was calculated by `daysLeft` (current date vs plan end date), while the progress bar and "Used" count were derived from a manual filter of `bookings` where `status` is 'completed' or 'unavailable'. These sources diverge because the counter doesn't reflect actual plan entitlements.
2.  **Unavailable Photo Upload**: The `PhotoSlot` uses a local retry mechanism. If `supabase.storage.upload` or the `service_photos` upsert fails, it stays in "SAVING..." or shows "UPLOAD FAILED".
3.  **Submission pipeline**: The Partner App submission uses `submit_service_unavailable` RPC, which (in migration `20260702220818`) requires **2 photos** for standard unavailability and **4 photos** for dirty vehicles. Frontend validation was inconsistent (sometimes checking for 1).

## Implementation Plan

### 1. Data Consistency & Entitlements
- **Unify Service Usage**: Use `get_vehicle_entitlements` RPC (already used in `PlanBalanceCard`) as the single source for "Used", "Total", and "Progress".
- **Entitlement Deduction**: Ensure `submitServiceOutcome` (server function) calls `try_consume_entitlement` via a new SQL trigger or direct call to ensure outcomes (COMPLETED, UNAVAILABLE, NEED_WASH) deduct exactly 1 Shine.
- **IST Authority**: Apply `formatBusinessDate` and `getTodayIST` to all subscription expiry and service day calculations.

### 2. Partner Service Flow & Photo Upload
- **Fix Photo Requirements**: Update Partner App validation to match RPC: 2 photos for `UNAVAILABLE`, 4 for `NEED WASH`.
- **Stabilize Upload Pipeline**: 
    - Improve `PhotoSlot` error handling and state management to prevent infinite "SAVING".
    - Enforce atomic submission: The "Submit" button only enables when `photo-slot` states for the required angles are truly 'done' (persisted in DB).
- **Atomic Outcome Submission**: Update `submitServiceOutcome` server function to verify photo counts and perform the entitlement deduction if not already handled by DB triggers.

### 3. Customer App Synchronization
- **Real-time Refresh**: Expand `subscriptions.tsx` realtime channel to listen to `subscription_entitlements` and `entitlement_ledger`.
- **Outcome UI**: Align `RecentServiceFeed` labels and icons with the canonical IST-aware outcomes.

## Technical Details

### Database Changes
- Add a trigger on `services` status change (to `completed` or `unavailable`) to call `try_consume_entitlement` automatically if it's a subscription service.
- Verify and update `submit_service_unavailable` RPC to ensure it records all provided photos correctly in `service_photos`.

### Component Updates
- `subscriptions.tsx`: Replace local `bookings` filtering with `get_vehicle_entitlements` query data.
- `PhotoSlot.tsx`: Clear local queue more aggressively on success; provide better feedback on network failure.
- `app.service.$id.tsx`: Update `unavailableDone` and `dirtyDone` logic to match the required photo counts (2 and 4 respectively).
