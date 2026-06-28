# Coverage Manager Finalization

Extends `coverage_zones` into the single source of truth for availability, capacity, partner ops, and expansion. No UI redesign — only adds panels/tabs inside the existing `/admin/coverage` page and the existing Expansion Requests page.

## Phase 1 — Schema additions (single migration)

Add to `public.coverage_zones`:
- `max_cars_per_partner int default 30`
- `max_route_distance_km numeric default 8`
- `max_travel_time_min int default 90`
- `start_time time default '07:00'`
- `finish_time time default '14:00'`
- `route_radius_km numeric default 1.5`
- `preferred_partner_ids uuid[] default '{}'`
- `backup_partner_ids uuid[] default '{}'`
- `neighbour_expand boolean default true`

New tables (each with GRANT + RLS + admin-only policies via `has_role`):
- `coverage_zone_calendar` — `zone_id`, `date_from`, `date_to`, `recurring_dow int[]`, `daily_shine_on`, `premium_on`, `reason`, `created_by`.
- `coverage_zone_history` — append-only audit (`zone_id`, `action`, `before jsonb`, `after jsonb`, `reason`, `operator`, `at`).
- `coverage_alerts` — `zone_id`, `kind`, `severity`, `message`, `payload jsonb`, `resolved_at`.

Trigger on `coverage_zones` to write `coverage_zone_history` on insert/update/delete (captures diff + `auth.uid()`).

Add to `supabase_realtime` publication.

## Phase 2 — Core RPCs

- `get_zone_dashboard()` → returns all 20 metrics per zone in one call (active customers, DS/premium splits, partner counts, marketplace queue depth, leads pending, today's services/completed, revenue today/month, renewals due, complaints, avg rating, capacity used %).
- `get_zone_capacity(zone_id, date)` → `{ daily_capacity, booked, remaining }` using partners × `max_cars_per_partner` minus today's confirmed services.
- `is_daily_shine_open(zone_id, date)` → combines calendar + remaining capacity. Called by `activate_paid_booking` to block DS subs when full/paused.
- `get_coverage_at` extended to AND-mask `daily_shine` / `premium` with active calendar window.
- `simulate_zone_change(zone_id, patch jsonb)` → returns `{ delta_houses, delta_customers, delta_requests, delta_partners, est_monthly_revenue }`.
- `rank_expansion_requests()` → groups `expansion_requests`, joins nearest zone (haversine on zone centers/bbox), returns ranked list with potential revenue.
- `admin_zone_calendar_upsert/delete`, `admin_zone_rollback(history_id)`.

## Phase 3 — Marketplace / Lead routing integration

- Update `pick_scored_partner_for_queue` (and lead-routing equivalent) to:
  - Resolve customer zone via `get_coverage_at`.
  - Filter to `preferred_partner_ids` first, then `backup`, then partners whose home zone matches.
  - If empty AND `neighbour_expand`, search neighbour zones (bbox overlap or center within `max_route_distance_km`) and emit a `coverage_alerts` row (`neighbour_expand_used`).
- Update `activate_paid_booking` to call `is_daily_shine_open` and reject with clear error when closed.

## Phase 4 — Alerts engine

`pg_cron` every 5 min runs `compute_coverage_alerts()`:
- ≥90% capacity, 0 active partners, marketplace queue age > threshold, lead pending > threshold, partner shortage (partners < zone min), service paused, GPS mismatch (customer geo outside any active zone).
Writes to `coverage_alerts`, dedupes by `(zone_id, kind)` while unresolved.

## Phase 5 — Admin UI (additive, inside existing `/admin/coverage`)

Add tabs to current page without redesign:
- **Dashboard tab** (default replaces current list view): table of zones with all 20 metrics, color-coded capacity chip (green→red→grey), realtime via `useRealtimeInvalidation(['coverage_zones','services','bookings','assignments','complaints','coverage_alerts'])`.
- **Calendar tab**: per-zone pause/resume single/range/recurring with reason.
- **Partners tab**: preferred/backup picker, capacity/route fields.
- **Alerts tab**: live alert list with resolve button.
- **History tab**: timeline + rollback button.
- **Simulation drawer**: opens from existing edit dialog "Preview impact" button — shows deltas before save.
- **Heat map**: recolor existing Google Maps polygons by capacity-used %.

Extend `/admin/expansion-requests` to call `rank_expansion_requests` and display potential metrics + nearest zone columns.

## Phase 6 — Customer guard

`src/lib/area-availability.ts` already calls `get_coverage_at`. When `daily_shine=false` due to capacity, surface message: "Daily Shine is temporarily full in your area." `src/routes/c/_authed/service.$slug.tsx` already gates booking; tweak error string to distinguish "full" vs "unavailable".

## Phase 7 — End-to-end verification

Single Playwright script logs in as admin, exercises each item, and writes `UrbanWash_Coverage_Manager_Verification.md` with PASS/PARTIAL/FAIL per row:
Radius Zone, Polygon Zone, Area Detection, GPS Matching, DS Availability, Premium Availability, Capacity Calc, Marketplace Routing, Lead Routing, Partner Assignment, Neighbour Expansion, Capacity Blocking, Calendar, Heat Map, Expansion Requests, Zone Analytics, Zone History, Audit Log, Realtime Updates.

## Out of scope
- No visual redesign of existing pages.
- No changes to customer or partner app shells beyond the one error string and the existing availability hook.
- No new auth, no new payment paths.

## Technical notes
- All admin RPCs gated by `has_role(auth.uid(),'admin')`.
- History trigger uses `to_jsonb(NEW)` minus volatile cols.
- Heat color computed client-side from `capacity_used_pct`.
- Simulation is read-only (no writes), pure SQL.
