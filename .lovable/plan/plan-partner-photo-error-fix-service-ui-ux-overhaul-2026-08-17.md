# Plan: Partner Photo Error Fix & Service UI/UX Overhaul

## Problem
1. **Critical Bug:** Photo uploads for "Before" stage fail with a database enum error `invalid input value for enum photo_angle: "full"`. The current database enum `photo_angle` only accepts `('front', 'rear', 'left', 'right')`.
2. **UI/UX Issues:** The service execution page is cluttered, has redundant text, and uses sub-optimal layouts for narrow mobile devices (360px).

## Proposed Changes

### 1. Database & Type Fixes
- Create a migration to add `full` to the `photo_angle` enum.
- Update `src/integrations/supabase/types.ts` to include `full` in `photo_angle`.
- Ensure all photo-saving logic uses the correct enum values.

### 2. UI/UX Overhaul (Unified One-Page Flow)
- **Header:** Clean up the header to remove "CUSTOMER DETAILS" orange branding. Focus on customer name, vehicle info, and status.
- **Top Actions:** Compact "Navigation" and "Call Customer" buttons.
- **Condition Selection:** 
  - Three immediate options: "Ready to clean", "Very dirty", "Unavailable vehicle".
  - High-contrast visual states for selection (Orange for Ready, Amber for Dirty, Red for Unavailable).
- **Photo Workflow:** 
  - Replace large empty boxes with compact premium photo cards.
  - Show "Before Photo" section immediately upon condition selection.
  - Implement "✓ PHOTO ADDED" state with a "RETAKE" option.
- **Main Action:**
  - Dominant orange "COMPLETE SERVICE" (or "MARK UNAVAILABLE") button at the bottom.
  - Disabled state until mandatory requirements (condition + photo) are met.
- **Responsiveness:**
  - Audit and fix all elements for 360px width.
  - Add `safe-bottom` padding to avoid overlap with bottom navigation.

### 3. Logic Improvements
- **Photo Association:** Verify photos are explicitly linked to `service_id` and `partner_id`.
- **State Persistence:** Ensure selecting a condition and taking a photo persists if the app is closed and reopened.
- **Error Handling:** Transform raw database errors into user-friendly messages with a "RETRY" option.

## Technical Details

### Migration
```sql
ALTER TYPE public.photo_angle ADD VALUE IF NOT EXISTS 'full';
```

### Components Updated
- `src/routes/_authenticated/app.service.$id.tsx`: Primary logic and layout overhaul.
- `src/components/partner/service/photo-slot.tsx`: UI refinement for compact display.
- `src/integrations/supabase/types.ts`: Type synchronization.

### Business Rules
- Status lifecycle: `PENDING` -> `IN_PROGRESS` -> `COMPLETED`/`UNAVAILABLE`.
- Mandatory Photos: "Before" photo required for Ready/Dirty. "Evidence" photo required for Unavailable.
- 26-day rule: Ensure earnings reflect the business formula.
