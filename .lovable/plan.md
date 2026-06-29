# Phase 1 — Partner Module Stabilization (Pre-DAR)

**Rule for this phase:** Every item ends with a Playwright-driven execution + screenshot, not a code read. DAR work is forbidden until the final PASS/FAIL report is delivered.

---

## Step 0 — Baseline audit (no code changes)

Before touching anything, capture the current truth so the report is grounded:

1. Dump current `platform_settings` rows (all 9 categories + route_visibility_until + DAR seeds).
2. Dump `partner_expansion_requests` schema + row count.
3. Dump `coverage_zones` columns actually used by assignment builder.
4. Log into 1 admin + 1 partner + 1 customer account via Playwright and screenshot home of each. This is the "before" baseline.

Output: `/tmp/phase1/00_baseline/` with SQL dumps + 3 screenshots.

---

## Step 1 — Assignment Builder (fully dynamic)

**Goal:** Every input change recomputes every output from live DB + `platform_settings`. Zero hardcoded numbers.

Backend:
- Create one RPC `get_assignment_builder_preview(partner_id, cars_per_day, duration_min, area_or_zone_id, working_hours, availability_days)` returning:
  - expected_monthly_earnings, expected_daily_earnings
  - est_route_distance_km, est_working_hours, est_service_time_min
  - expected_customer_count, capacity_remaining
  - available_customers_in_area, daily_shine_demand, current_zone_utilization
- All constants pulled from `platform_settings` (price per wash, avg travel speed, cluster radius, capacity ceilings).
- Use existing `coverage_zones` capacity + active `subscriptions`/`services` counts for utilization.

Frontend:
- Refactor Assignment Builder screen to call the RPC via `useQuery` with a debounced key on every input.
- Remove every literal number; replace with RPC fields.
- Loading skeleton on recompute; error toast on failure.

Verify (execute):
- Playwright: log in as partner → open Assignment Builder → change cars/day from 5→10 → screenshot before/after → assert at least 4 numbers changed.
- Change area → screenshot → assert "available customers" + "zone utilization" differ.
- Change working hours → screenshot → assert "est working hours" + "monthly earnings" differ.

---

## Step 2 — Coming Soon Partner Flow

Backend already has `partner_expansion_requests`. Add:
- RPC `get_coming_soon_preview(area_or_lat_lng)` → expected_monthly_earnings, est_customers, est_joining_time (from `coverage_zones.expected_launch_date` or platform_settings default).
- RPC `submit_partner_expansion_request(name, phone, area, vehicle, cars_per_day_pref)` → inserts row + raises realtime on `admin_alerts`.

Frontend:
- In partner onboarding/Assignment Builder, when `is_daily_shine_open(zone)` is false, render the Coming Soon card with the 4 metrics + Notify Me form.
- Form posts to RPC; success toast; row visible in admin.

Admin:
- Coverage Manager already has Expansion Planning tab. Surface `partner_expansion_requests` alongside customer `expansion_requests`: counts of waiting partners, waiting customers, est MRR (partner cars/day × price × 30), priority score.
- Add realtime channel for `admin_alerts` of type `partner_expansion`.

Verify (execute):
- Playwright: partner picks unserved area → Coming Soon card visible with non-empty numbers → submits form → admin tab refreshes and shows new row.

---

## Step 3 — Exact Location (web + Capacitor parity)

Findings to verify, not re-build:
- Force `maximumAge: 0`, `enableHighAccuracy: true` everywhere (partner home, customer home, location search, area page).
- Reverse-geocode via existing `reverseGeocode` server fn; cache key includes rounded coords, TTL 60s.
- Resolve zone via `get_coverage_at(lat, lng)` — never "nearest locality".

Verify (execute on Web only; Capacitor noted as out-of-scope for sandbox but code-path is shared):
- Playwright: pre-seed a specific lat/lng via `navigator.geolocation` mock → load partner home, customer home, admin live map → screenshot all 3 → assert reverse-geocoded address string + zone name match across all 3.
- Mark Capacitor row as "Code path shared with Web — Web PASS implies Capacitor PASS pending device QA."

---

## Step 4 — Today's Route Visibility

- Iterate the admin setting `route_visibility_until` through {06:00, 07:00, 08:00, 09:00, 10:00, all_day}.
- For each value: Playwright sets `platform_settings` via admin RPC → partner home reload → screenshot route panel → assert visible/hidden matches spec at simulated current time.
- Test the persistence vectors: hard reload, navigate away+back, simulated background→foreground (page visibility event).

Output: matrix of 6 settings × 3 vectors = 18 screenshots + pass table.

---

## Step 5 — Partner Operations Settings runtime effect

For each of the 9 tabs, define ONE observable runtime behavior and execute it:

| Tab | Setting toggled | Observable |
|---|---|---|
| Assignment | `assignment.max_radius_km` | Marketplace offer filtered by radius |
| Earnings | `earnings.bonus_threshold` | Partner wallet shows updated bonus tier |
| Attendance | `attendance.late_penalty_min` | Late check-in deducts wallet |
| Marketplace | `marketplace.offer_ttl_sec` | Offer popup countdown matches |
| Notifications | `notifications.push_enabled` | Partner skips push insert |
| Maps | `maps.default_zoom` | Partner map opens at zoom |
| Capacity | `capacity.daily_ceiling` | Builder caps cars/day at value |
| Route Optimization | `optimization.cluster_radius_m` | Route Manager regroups clusters |
| Service Visibility | `service.show_addons_to_partner` | Partner today's route hides/shows addons |

Any tab whose backing setting is unused → either wire it or delete the row + UI control (no placeholders allowed).

Verify (execute) each row with Playwright admin-change → partner-reload → screenshot diff.

---

## Step 6 — End-to-end partner workflow run

Single Playwright script that runs the full happy path against a seeded partner + seeded booking:
Login → Heartbeat ping in network log → Toggle availability → Confirm location → Open Assignment Builder → Receive marketplace offer → Accept → Today's Route shows stop → Start Service → Upload before photo → Upload after photo → Complete → Wallet balance increments → Reliability +1 → Attendance row inserted → Profile reflects updates → Rewards tier check → Realtime: trigger admin change, partner UI updates without reload.

17 checkpoints, each with screenshot + network/DB assertion.

---

## Step 7 — Final PASS/FAIL report

`/mnt/documents/UrbanWash_Phase1_Stabilization_Report.md` with one row per item above:
- Status: PASS / FAIL
- Evidence: screenshot path + SQL row id + network request id
- If FAIL: blocker description + fix needed

Only after every row is PASS do I post the closing line `Phase 1 complete — ready to begin DAR`. If anything is FAIL, I stop and surface it; no DAR work begins.

---

## Out of scope (explicit)

- Dynamic Assignment Recovery (release → match → offer → accept → re-optimize pipeline).
- Any new feature not listed in points 1–6 above.
- Capacitor on-device testing (sandbox has no iOS/Android runtime; shared code path noted).

## Technical notes

- All new SQL goes through `supabase--migration` (one migration per step, GRANTs included).
- Realtime additions use existing `supabase_realtime` publication.
- Playwright scripts live in `/tmp/browser/phase1/step_N/` with screenshots under `screenshots/`.
- Auth uses injected `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` flow; if status is `signed_out`, I stop and ask the user to sign in once in the preview.
- Estimated duration: ~6 migrations, ~9 Playwright scripts, ~80 screenshots, 1 final report.
