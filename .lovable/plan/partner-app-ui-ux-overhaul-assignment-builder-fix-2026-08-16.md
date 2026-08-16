# Partner App UI/UX Overhaul & Assignment Builder Fix

This plan overhauls the Partner App's "Available Work" (Assignment Builder) experience to be extremely simple, state-driven, and premium. It also fixes the bottom navigation clipping issue and standardizes earnings calculations.

## User Improvements

### 1. State-Driven Experience
- **New Partners (No Assignment):** See a "Build Your Assignment" flow: Work Area → Hours → Days → Earnings → Create.
- **Active Partners:** See "Today's Assignment" summary: Customers → Daily/Monthly Earnings → Start Time → Progress.
- **Cancel Assignment:** ONLY visible to partners with an active assignment.

### 2. Simplified Builder
- **Work Area:** Large "Choose Your Work Area" card.
- **Hours Slider:** 2–6 hours range with automatic start/end time updates (e.g., "6:00 AM → 10:00 AM").
- **Days Slider:** 7–30 days commitment range.
- **Earnings:** Instant updates using the **₹Daily × 26 Service Days** rule (Mondays OFF).
- **Available vs Target:** Clearly explains "Target" (capacity) vs "Available Now" (customers ready in area).

### 3. Premium Bottom Navigation
- **Clipping Fix:** Navigation label for "Available Work" changed to "Available".
- **Design:** Compact 70px height, premium icons (24px), glass-effect background, and proper safe-area padding for all Android devices.

### 4. Assignment Cancellation
- **Confirmation Sheet:** Clear summary of what's being released (Customers, Daily/Monthly Earnings).
- **Logic:** Atomic release of the entire assignment back to the marketplace.

## Technical Details

### Frontend Changes
- **`app.assignments.tsx`:** Complete refactor to implement conditional rendering between `STATE A` (Builder) and `STATE B` (Active View).
- **`PartnerShell.tsx`:** Update `Available Work` label to `Available` and ensure `whitespace-nowrap` layout stability.
- **`app.index.tsx`:** Standardize monthly earnings calculations to `Daily × 26`.
- **`MarketplaceOfferCard.tsx`:** Update monthly earning displays and button styling.

### Backend/Logic
- Enforce `SERVICE_DAYS_PER_MONTH = 26` across all UI projections.
- Use existing `accept_assignment_v2` and `cancel_assignment` RPCs for atomic operations.
- Exclusion logic: Ensure cancelling partner is excluded from immediate rebroadcast notifications (handled by existing `dispatch.server.ts` filters).

### Verification
- Test on mobile viewports for no-overlap layout.
- Verify "Cancel Assignment" visibility matches backend `active` assignment state.
- Confirm "Available" nav label fits on one line across all devices.
