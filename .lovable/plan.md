# Coverage Zone Management System

Replaces the current `service_areas` table (named-locality lookup) with a true GIS layer: admin-drawn **radius** and **polygon** zones on a Google Map. Availability is decided purely by GPS-in-zone tests with zone priority. No hardcoded area names anywhere in the codebase.

## 1. Database (migration)

New table `public.coverage_zones`:

- `id`, `name`, `city`, `color` (hex), `priority` (int, higher wins)
- `zone_type` text check in (`radius`, `polygon`)
- `center_lat`, `center_lng`, `radius_m` (radius zones)
- `polygon` jsonb — `[[lng,lat], ...]` ring (polygon zones)
- `bbox_min_lat/max_lat/min_lng/max_lng` (auto-computed for fast pre-filter)
- 12 service flags: `daily_shine_enabled`, `premium_enabled`, `washing_enabled`, `interior_enabled`, `exterior_enabled`, `int_ext_enabled`, `deep_clean_enabled`, `polish_enabled`, `cutter_polish_enabled`, `roof_cleaning_enabled`, `seat_cleaning_enabled`, `corporate_fleet_enabled`, `emergency_enabled`
- Capacity/ops overrides: `primary_team_id`, `backup_team_id`, `max_daily_capacity`, `max_active_partners`, `max_customers`, `max_services`, `assignment_radius_m`, `route_optimization_radius_m`, `travel_buffer_min`
- `status` text check in (`active`, `paused`)
- `created_at`, `updated_at`, RLS: admin write, authenticated read active zones

Extend `public.expansion_requests` (already exists) with `requested_service`, `lat`, `lng` if missing — already present per schema.

Keep `service_areas` table for now (read-only legacy) but mark deprecated. All runtime reads switch to `coverage_zones`.

## 2. RPCs (Postgres, security definer)

- `get_coverage_at(p_lat, p_lng) returns coverage_zones row + matched bool` — bbox pre-filter, then point-in-polygon (ray cast in plpgsql) or haversine-in-radius; returns highest-priority match. Returns merged availability when multiple zones overlap (OR of service flags, taking highest-priority zone's capacity overrides).
- `admin_zone_upsert(payload jsonb)` — admin-only, auto-computes bbox.
- `admin_zone_delete(id)`, `admin_zone_duplicate(id)`, `admin_zone_set_status(id, status)`.
- `admin_zone_analytics(id)` — returns counts: active customers in zone, partners assigned, leads, services today, revenue today/month, complaints, avg rating, capacity used.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE coverage_zones`.

## 3. Admin → Coverage Manager

New route `src/routes/admin.coverage.tsx`:

- Full-screen Google Map (Maps JS, already configured)
- Toolbar: **Create Radius Zone**, **Draw Polygon**, **Heat Map toggle**, city filter
- Drawing via `google.maps.drawing.DrawingManager`
- Sidebar list of all zones with status pill, priority, color swatch
- Click zone → edit panel: name, color, priority, 13 service toggles, capacity overrides, primary/backup team
- Actions: Edit / Delete / Duplicate / Pause / Resume / Change Priority
- Heat map fill colors:
  - Green: daily_shine + premium
  - Blue: daily_shine only
  - Orange: premium only
  - Grey: neither (draft)
  - Red: paused
- Expansion Requests layer: pins from `expansion_requests`, click pin shows phone/service/date

Replaces the existing `/admin/service-areas` page (we'll keep the route and redirect to `/admin/coverage`).

## 4. Client availability hook

Rewrite `src/lib/area-availability.ts`:

- `useCoverageAt(lat, lng)` — calls `get_coverage_at` RPC, returns `{ matched, zone, flags }`.
- `isServiceAllowed(slug, flags)` — same mapping as today (extended to new service slugs).
- Geo source: `uw_customer_geo` localStorage (already populated by location flow). When GPS missing, returns `matched=false` → "Coming Soon" UI.

## 5. Customer app behaviour

- `src/routes/c/_authed/home.tsx`: switch from `useAreaAvailability` (pincode/name) to `useCoverageAt(geo.lat, geo.lng)`. Catalog logic unchanged: per-tile "Coming Soon" badge when service flag false; full "We're Coming Soon" screen when `matched=false`.
- `src/routes/c/_authed/service.$slug.tsx`: pre-pay validator already calls availability RPC — swap to `get_coverage_at`.
- Vehicles / addresses / profile / history pages remain accessible outside zones (no change needed — they don't gate on availability).

## 6. Partner & marketplace integration

- `pick_scored_partner_for_queue` (marketplace): add zone gate — booking's GPS must fall in an active `daily_shine_enabled` zone, and candidate partner's `home_lat/lng` must fall in the same or overlapping zone (using `assignment_radius_m` override if present).
- `activate_paid_booking` (service-lead router): use `get_coverage_at` instead of pincode match to decide marketplace vs `service_leads`.
- Partner app feed already filters by partner team; no schema change required.

## 7. Removed / deprecated

- `SERVICE_AREA_NAMES` constant (already removed)
- `/admin/service-areas` UI replaced by Coverage Manager (route kept as redirect for bookmarks)
- `area_waitlist` reads (already migrated to `expansion_requests`)

## 8. Verification

Single Playwright + SQL pass that exercises:
1. Create radius zone via RPC → verify it appears in admin list
2. Create polygon zone → `get_coverage_at` returns it for interior point, not exterior
3. Toggle service flag → customer home reflects within 1 query refresh
4. Overlapping zones → highest-priority wins
5. Paused zone → customer sees "Coming Soon"
6. Marketplace gate: booking outside any DS zone routes to leads, not queue
7. Expansion request insert → appears on Coverage Manager map

Returns PASS / PARTIAL / FAIL table.

## Out of scope for this turn

- Realtime team management UI (we wire the FK columns; the team CRUD page can come later)
- Full per-zone analytics dashboard charts (RPC returns numbers; UI shows them in a simple panel — charts deferred)
- Advanced map clustering of expansion-request pins (basic markers for now)

## Technical notes

- Polygon point-in-polygon implemented in plpgsql ray-cast (no PostGIS dependency — keeps migration light)
- Bbox columns are the indexed pre-filter so `get_coverage_at` stays sub-ms even with thousands of zones
- All map drawing uses Maps JS Drawing library loaded with existing browser key
- No hardcoded area names introduced; every gate goes through `get_coverage_at`