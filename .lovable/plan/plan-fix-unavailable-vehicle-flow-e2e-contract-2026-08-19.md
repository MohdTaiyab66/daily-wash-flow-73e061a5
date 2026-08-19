# Plan - Fix Unavailable Vehicle Flow E2E Contract

The Unavailable Vehicle flow is failing in E2E tests due to a contract mismatch between the frontend, the `service_photos` database table, and the `submit_service_unavailable` RPC. Specifically, the frontend uses numeric strings ("1", "2") for photo angles, while the database enum `photo_angle` only accepts `front`, `rear`, `left`, `right`, and `full`. This causes a runtime crash when the photo slot tries to save metadata to the database.

## User Review Required

> [!IMPORTANT]
> The fix involves mapping Evidence Photo 1 to 'front' and Evidence Photo 2 to 'rear' to satisfy the database schema without changing the existing enum.

- **Photo Contract Mapping**:
  - Evidence #1 will be stored as `angle='front'`
  - Evidence #2 will be stored as `angle='rear'`
- **Validation**:
  - Unavailability still requires exactly 2 photos.
  - "Need Wash" still requires exactly 4 photos (mapped to `front`, `rear`, `left`, `right`).

## Proposed Changes

### Database / Migrations
- Create a new migration to ensure the `submit_service_unavailable` RPC and `service_photos` table correctly handle the new mapping if any internal validation is too strict. (Actually, the RPC takes `text[]` for paths, so it's mostly the `service_photos` record that fails).
- Update `submit_service_unavailable` to explicitly check the `service_photos` table for the correct angles (`front`, `rear`) if it performs independent validation.

### Frontend
#### [PhotoSlot Component](src/components/partner/service/photo-slot.tsx)
- Add an explicit mapping logic for "unavailable_vehicle" workflow to map "1" -> "front" and "2" -> "rear".
- Ensure the `angle` passed to the Supabase `.upsert()` call uses these mapped values.

#### [Service Detail Page](src/routes/_authenticated/app.service.$id.tsx)
- Update `pickPhotoPaths` calls to use `["front", "rear"]` instead of `["1", "2"]` when selecting photos for the `unavailable` stage.
- Update the `PhotoSlot` usage to reflect the new mapping or ensure consistency.

#### [Service Workflow Functions](src/lib/service-workflow.functions.ts)
- Update `submitServiceOutcome` server function to reflect the corrected photo angle contract.

## Technical Details
- **Enum Parity**: The `photo_angle` enum in Supabase is defined as `('front','rear','left','right','full')`. The frontend was sending `'1'` and `'2'`, which triggered `P04PHOTO` (or a direct Postgres enum error).
- **Atomic Submission**: Ensure the `submit_service_unavailable` RPC correctly links the provided photo paths to the service record and deducts entitlements atomically.

## Verification Plan
- **Automated Tests**: Use a Playwright script to simulate the Partner UI flow:
  1. Open a service.
  2. Select UNAVAILABLE.
  3. "Upload" two photos (mocked paths).
  4. Verify the `service_photos` table has records with `stage='unavailable'` and `angle` as `front`/`rear`.
  5. Call `submitServiceOutcome` and verify it succeeds.
  6. Verify the Customer App shows the "Unavailable" status with evidence photos.
