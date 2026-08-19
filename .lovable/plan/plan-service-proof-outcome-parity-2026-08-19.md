# Plan: Service Proof & Outcome Parity

Fix and complete the proof-of-service system to ensure customers see actual photos and canonical outcome labels (COMPLETED, UNAVAILABLE, NEED WASH) across the app, ensuring data consistency and multi-vehicle isolation.

## User Review Required

> [!IMPORTANT]
> The `submit_service_unavailable` RPC currently requires **2 photos** for standard unavailability and **1 photo** for `dirty_vehicle` (Need Wash). I will maintain this requirement in the frontend to ensure database compliance.

- Does the customer need a specialized "Report Issue" button for Unavailable/Need Wash outcomes, or just the status visibility? (Currently assuming visibility + 2h complaint window applies to all outcomes).

## Proposed Changes

### Partner App (Service Resolution)
- **Error Handling & Retry:** Update `PhotoSlot` in `src/components/partner/service/photo-slot.tsx` to include explicit retry UI if an upload fails, and ensure the main "Finish" button is disabled until all required photos (based on outcome) are successfully uploaded.

### Customer App (Proof Visibility)
- **Home Feed Overhaul:** Modify `src/components/customer/RecentServiceFeed.tsx` to:
    - Include `unavailable` and `dirty` (Need Wash) statuses in the feed.
    - Map database stages to canonical labels: `dirty` -> "NEED WASH", `unavailable` -> "UNAVAILABLE".
    - Display outcome-specific evidence photos (e.g., the 1-2 photos captured for unavailability).
- **Booking Detail Update:** Update `src/routes/c/_authed/bookings.$id.tsx` to:
    - Fetch and display photos for non-completed outcomes.
    - Update the `completion` query to handle all resolution states.
    - Ensure the timeline/status badge reflects the true service outcome.
- **Photo Viewer Enhancement:** Update `src/components/customer/ServicePhotoViewer.tsx` to:
    - Support all photo stages (`before`, `after`, `proof`, `dirty`, `unavailable`).
    - Standardize labels to match the Partner app naming (Ready to Clean, Unavailable, Need Wash).

### Backend / RPC Integration
- **Notification Verification:** Ensure that the `customer_notifications` row inserted by `partner_complete_service` and `submit_service_unavailable` includes the correct `metadata->photos` array so the customer sees the proof instantly.

## Technical Details

- **Queries:** `list_my_recent_services` and `list_my_service_history` already return `photos` (JSONB) and `dirty_report`. I will ensure the frontend correctly parses these even when `status` isn't `completed`.
- **Photo Stages:**
    - Completed -> `before`, `after`.
    - Unavailable -> `proof` (from `unavailable_photo` or `photos` array).
    - Need Wash -> `dirty` (from `dirty_report`).
- **Isolation:** Using `p_vehicle_id` in RPC calls and filtering by `vehicle_id` in hooks to prevent cross-vehicle photo leaks.

## Constrains & Security
- **Signed URLs:** All photos continue to use 60-minute signed URLs for privacy.
- **RLS:** Using `user_owns_service` security definer function to strictly gate access to photo storage.
