# Area Availability Management

Replace static `SERVICE_AREAS` / "Coming Soon" with a DB-driven `service_areas` table managed from Admin → Settings → Service Areas. Drives Daily Shine / Premium availability across Customer + Partner + Admin in real time.

## 1. Database

**New table `public.service_areas`**
- `id`, `name` (unique), `city`, `state`, `pincodes text[]`, `center_lat`, `center_lng`, `radius_km`, `polygon jsonb`
- `is_active bool`
- `daily_shine_enabled bool`, `premium_enabled bool`
- Per-service flags: `washing_enabled`, `interior_enabled`, `exterior_enabled`, `deep_clean_enabled`, `polish_enabled`, `cutter_polish_enabled`, `seat_cleaning_enabled`, `roof_cleaning_enabled`
- `launch_date`, `notes`
- Realtime enabled. RLS: anon `SELECT` (needed to compute availability before sign-in), `authenticated` SELECT, admin manage.

**New table `public.expansion_requests`**
- `customer_id` (nullable), `phone`, `area_name`, `pincode`, `lat`, `lng`, `interested_service`, `created_at`, `status`
- Realtime + admin notifications via existing channel pattern. RLS: insert open to anon, select for admin.

**RPC `get_area_availability(p_lat, p_lng, p_pincode text)`**
- Returns the matched area row + computed `{ daily_shine, premium, services{...} }`.
- Match priority: pincode contains → point in polygon → within radius of center → nearest active area within 5km → null.

**Seed**: All 14 listed areas with the specified Daily Shine / Premium flags. Drop legacy hardcoded coords.

## 2. Admin → Settings → Service Areas (`/admin/service-areas`)

- Table list with toggles (active, daily shine, premium) inline.
- Edit dialog: full area form, per-service toggles, pincode chips, radius slider, optional polygon JSON.
- Bulk action: enable/disable Daily Shine or Premium across selected areas.
- Add to sidebar nav.

## 3. Admin → Expansion Requests (`/admin/expansion-requests`)

- Grouped by area: count of customers, daily-shine vs premium interest, last 5 requesters.
- CSV export. Realtime updates.

## 4. Customer App integration

- New hook `useAreaAvailability()` calls `get_area_availability` using stored customer address coords/pincode.
- `c/home`, `c/services`, `c/service/$slug`, `c/subscriptions`:
  - Both off → "Coming Soon" screen with **Notify Me** form (writes `expansion_requests`). Profile/vehicles/addresses/history remain usable.
  - Daily Shine off, Premium on → Daily Shine plan cards become disabled "Coming Soon" badges; premium services bookable.
  - Premium off, Daily Shine on → Premium service tiles disabled "Coming Soon"; subscription flow intact.
  - Both on → no banners.
- `location.search.tsx`: replace `nearestServiceArea` distance check with RPC result. Out-of-area shows Notify Me capturing pincode/GPS.
- Booking submit path validates with RPC again; blocks payment if disabled.

## 5. Partner & Maps

- Partner area picker reads from `service_areas` (active only).
- Admin Customer Map / Route Manager overlay: shade enabled areas green, disabled red, expansion-request pins.

## 6. Cleanup

- Keep `src/lib/areas.ts` as thin wrapper that fetches from DB (cached) for legacy callers, but mark deprecated.

## 7. Verification

Playwright sweep:
1. Toggle Adil Nagar Daily Shine off → customer at that pincode sees Daily Shine "Coming Soon", premium still works.
2. Toggle both off → "We're Coming Soon" + Notify Me; submit creates expansion request visible in admin.
3. Toggle Premium off in Gomti Nagar → premium tiles disabled.
4. Booking attempt on disabled service returns validation error pre-payment.
5. Marketplace + Service Leads flows unaffected for enabled areas.

Final PASS/PARTIAL/FAIL report saved to `/mnt/documents/UrbanWash_Area_Mgmt_Report.md`.

## Technical notes

- Single migration for tables + RLS + GRANTs + realtime publication + seed RPC.
- Seed data via `supabase--insert` after migration approval.
- Reuse existing admin nav pattern in `src/routes/admin.tsx`.
- Availability hook uses TanStack Query with 60s stale + realtime invalidation on `service_areas` changes.
