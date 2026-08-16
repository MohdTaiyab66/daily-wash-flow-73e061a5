# Plan: Urban Wash Partner — Zero Customer Assignment Flow

This plan addresses the business requirement where partners should be allowed to create an assignment even if there are zero customers currently available in their selected area. Zero customers will no longer be treated as an error, but as a valid "Waiting for Customers" state.

## User Review Required

> [!IMPORTANT]
> - The assignment creation will now succeed with 0 customers. The partner's assignment state will be `ACTIVE`, but with 0 services until new customers are assigned or become available.
> - The UI will shift from an error-based approach to an informational approach when `availableCount` is 0.
> - The Admin Panel will see the assignment as `ACTIVE` with `0` current customers, but the status will reflect they are waiting for work.

## Proposed Changes

### Database (Supabase)

#### [MARKETPLACE-FLOW:DB:01] Update `accept_assignment_v2`
- Remove the `RAISE EXCEPTION` when `v_found = 0`.
- Allow the assignment to be created with `target_cars = p_cars` (the partner's commitment) even if `v_found` (current customers) is 0.
- Ensure `estimated_earnings` and other projected metrics reflect the *target* commitment, not just current availability.
- The `services` table will remain empty for the assignment until work is added.

### Frontend (Partner App)

#### [MARKETPLACE-FLOW:UI:01] Update `app.assignments.tsx`
- **Zero Customer Logic**:
    - `confirmDisabled` logic will no longer block when `availableCount === 0`.
    - The large red error banner in the confirmation modal will be replaced with a premium, neutral "Waiting for Customers" block.
- **Confirmation Modal Enhancements**:
    - Display both "CUSTOMER TARGET" (e.g., 24) and "CURRENTLY AVAILABLE" (e.g., 0).
    - Update the primary CTA text to "CONFIRM & WAIT FOR WORK" when availability is zero.
    - Show a success modal after creation that clearly explains the waiting state.
- **Layout & Spacing**:
    - Ensure the "Waiting for Customers" information block uses Urban Wash premium colors (soft green/neutral) and doesn't dominate the layout.

#### [MARKETPLACE-FLOW:UI:02] Update `app.index.tsx` (Partner Home)
- **Active Waiting State**:
    - When an active assignment exists but has 0 services today, show a dedicated "WAITING FOR CUSTOMERS" view instead of "No Active Assignment".
    - Display the active area and a reassuring message that leads will arrive via notification.
    - Ensure the "Build Your Plan" button is not shown if an active assignment already exists.

### Backend (Server Functions)

#### [MARKETPLACE-FLOW:SERVER:01] Verify Lead Distribution
- The existing marketplace rebroadcast tick and lead distribution logic should already pick up new customers and broadcast them to eligible partners.
- We will ensure that partners in an "Active" assignment with 0 customers are considered eligible for new leads in their area.

## Verification Plan

### Automated Tests
- **Test Zero Customers**: Create an assignment in an area with 0 customers. Verify:
    - Button is enabled.
    - "Confirm & Wait for Work" text appears.
    - No red errors.
    - Assignment is created in DB.
    - Home screen shows "Waiting for Customers".
- **Test Customers Available**: Verify normal flow is preserved when customers > 0.
- **Test Duplicate Prevention**: Verify attempting to create a second assignment is blocked.

### Manual Verification
- Check the Partner Home screen transition from "Waiting" to "Active work" when a lead is accepted.
- Verify Admin Panel visibility for the new assignment.
