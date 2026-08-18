# Plan: Fix "Unavailable Vehicle" Flow

The "Unavailable Vehicle" flow in the Partner App fails with a `P04PHOTO` error because the database expects 2 photos for unavailability reports, but the frontend only provides one. I will unify the requirement to 1 photo for standard unavailability and keep 4 for dirty vehicle reports.

## Proposed Changes

### Database (Lovable Cloud)
- Create a migration to update the `submit_service_unavailable` RPC.
- Change the minimum photo requirement from 2 to 1 for non-dirty reasons.
- Keep the 4-photo requirement for `dirty_vehicle` reason.

### Frontend
- Update `src/routes/_authenticated/app.service.$id.tsx` to handle both standard unavailable and dirty vehicle flows correctly.
- Add a dedicated "Dirty Vehicle" submission path that collects 4 photos.
- Ensure the "Unavailable Vehicle" path continues to collect 1 photo but now matches the database contract.
- Fix the logic that passes the `reason` to the RPC to match the `unavailable_reason` enum.

## Technical Details
- **Migration:** `supabase/migrations/20260818160000_fix_unavailable_photo_count.sql`
- **RPC Update:** `v_min_photos := CASE WHEN v_is_dirty THEN 4 ELSE 1 END;`
- **Frontend Mutation:** Update `markUnavailable` to use the correct reason and collected photos. Add `markDirty` for the dirty vehicle flow.

## Verification Plan
- **Automated Check:** Run a Playwright script to simulate marking a vehicle as unavailable with 1 photo and verify the RPC call succeeds (or at least doesn't return `P04PHOTO`).
- **Manual Verification:** Verify the UI displays the correct number of photo slots based on the selected condition (1 for unavailable, 4 for dirty).
