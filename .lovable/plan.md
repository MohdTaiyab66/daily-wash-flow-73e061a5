
# Urban Wash – Partner Stability & Marketplace Fix

Strict order. Nothing new is wired into UI until each prerequisite passes its own check. No error suppression — every fix lands at the real layer (RLS, RPC, geolocation, settings resolver).

---

## Phase 1 — Partner Login Bug ("Not allowed to change the status")

**Root-cause investigation (read-only first):**
1. `rg` every call fired after OTP verify: `updatePartnerStatus`, `useToggleOnline`, `usePartnerHeartbeat`, attendance auto check-in, `last_seen` writers, push token registration, FCM hooks.
2. Inspect every trigger on `partners` (`tg_*`, `trg_*`) and any RLS policy on `partners`, `attendance`, `push_tokens` that raises `Not allowed to change status`.
3. Query `pg_proc` / triggers for the literal error string to pinpoint the source.

**Fix:**
- Correct the offending RLS / trigger so partners may legitimately update their own `availability`, `last_seen`, attendance row, and push token on login.
- If a trigger guards transitions (e.g. suspended→online), allow the no-op / first-login transition explicitly.
- Sequence post-login effects in one orchestrator (`useEffect` in partner shell) so failures surface as one toast, not a cascade.

**Verify:** Playwright login as partner `9696...`, confirm no toast, `partners.availability='online'`, `attendance` row inserted, `last_seen` fresh, no console errors.

---

## Phase 2 — Real GPS (Partner + Customer)

**Root cause:** Hardcoded Khurram Nagar fallback or cached `uw_customer_geo` / partner location reused without re-prompting.

**Fix:**
- Central `getFreshLocation()` util: `navigator.geolocation.getCurrentPosition({ enableHighAccuracy:true, maximumAge:0, timeout:15000 })` with explicit permission handling; on Capacitor, use `@capacitor/geolocation` when `platform.isNative`.
- Always reverse-geocode through Google Maps gateway server fn (`src/lib/geo.functions.ts`) — never trust localStorage on refresh; cache only for session, not across loads.
- Remove every hardcoded Khurram Nagar / Lucknow fallback. If permission denied → show explicit "Enable Location" CTA, never silently substitute coords.
- Partner: write `partners.last_lat/last_lng/last_address` on heartbeat tick.
- Admin live map already reads `partners.last_lat/lng` → will match automatically.

**Verify:** Customer + partner both show real lat/lng + resolved area; admin live map dot matches.

---

## Phase 3 — Assignment Builder reactivity

**Root cause:** Builder reads static derived values; no recompute when inputs change; coverage zone capacity not fed in.

**Fix:**
- New server fn `computeAssignmentEstimate({ cars_per_day, duration_days, radius_m, area_zone_id, availability_window })` returning `{ expected_earnings, working_hours, route_distance_km, customer_count, capacity_remaining }` using `coverage_zones` settings + `platform_settings` rates.
- `useQuery` keyed on every input → realtime updates while sliders move (debounced 250ms).
- Replace hardcoded constants in `app.my-assignment.tsx` / `assignments` builder.

---

## Phase 4 — Coming Soon + Partner Expansion Requests

**Schema:** new table `partner_expansion_requests(id, partner_id nullable, name, phone, area, lat, lng, vehicle, experience_years, preferred_cars_per_day, expected_join_date, notes, status, created_at)` with grants + RLS.

**Partner UI:**
- When coverage check → `daily_shine=false`, hide builder, render "Coming Soon" card + registration form (still calculate hypothetical earnings/customers from neighboring zone averages for motivation).

**Admin:**
- Coverage Manager → "Expansion Intelligence" tab gains *Waiting Partners* count + revenue/priority score (already has waiting customers; join in the new table).
- Realtime channel on `partner_expansion_requests` → admin notification toast + `admin_alerts` row.

---

## Phase 5 — Today's Route Visibility Setting (genuine fix)

**Root cause to confirm:** UI reads `platform_settings.route_visibility_window` but a stale local fallback or `services.scheduled_start_time` hides past stops after 10 AM regardless.

**Fix:**
- Single resolver `getRouteVisibility()` reading `platform_settings` ('ALL_DAY' | 'HH:MM') with no client default override.
- `app.live.tsx` filters strictly on resolver; remove any `scheduled_start_time < now() - 2h` hide condition.
- Admin Settings writes propagate via realtime invalidation.

**Verify:** Set ALL_DAY → route visible at any hour; set 10:00 → hidden before 10:00, visible after.

---

## Phase 6 — Dynamic Assignment Recovery (new core feature)

**Trigger events that "release" customers from partner A:**
- assignment cancel, partner offline >X min, rejected/absent unavailability report, emergency_leave flag.

**Schema additions:**
- `services.released_at`, `services.released_reason`, `services.recovery_offer_id`.
- New table `recovery_offers(id, service_ids[], from_partner_id, to_partner_id, distance_delta_m, earnings_delta_paise, expires_at, status)`.

**Server logic (RPC + cron tick):**
1. `release_partner_customers(partner_id, reason)` — marks affected today's `services` released, unsets `partner_id`/`assignment_id`.
2. `find_recovery_candidates(service_ids[])` — for each released cluster, query partners within zone where `remaining_capacity = max_cars - assigned_today_count >= cluster_size`, sorted by added distance via `route-optimize`.
3. Push `recovery_offer` row → realtime → partner B sees offer card (in existing Daily Shine offer surface; not new UI surface, reused component pattern).

**Partner action:** Accept All / Accept Selected / Ignore → `accept_recovery_offer` reassigns services and triggers `route-optimize` full recompute (not append) respecting locks/exact-time/clusters.

**Customer:** No new event types; existing whitelist (`service_started` etc.) already blocks reassignment leaks.

---

## Phase 7 — Route re-optimization on accept

Reuse `src/lib/route-optimize.ts` cluster-first greedy; on accept, re-run full optimize with new merged stop list. Honour: `locked_position`, `manual_sequence_no`, `is_emergency`, `time_window_type='exact'`.

---

## Phase 8 — Admin Controls (Settings → Partner Operations → Dynamic Assignment Recovery)

Add tab fed by `platform_settings` keys `dar.enabled`, `dar.min_remaining_capacity`, `dar.max_extra_cars`, `dar.search_radius_m`, `dar.max_travel_increase_min`, `dar.min_earnings_paise`, `dar.auto_suggest`, `dar.auto_optimize`, `dar.partner_timeout_sec`, `dar.retry_count`, `dar.preferred_partner_ids`, `dar.emergency_mode`. All editable via existing settings table.

---

## Phase 9 — Live Admin Dashboard (Recovery KPIs)

New RPC `admin_recovery_dashboard()` returning the 8 metrics. Surface as a card row inside existing Route Manager — no new top-level UI page. Realtime: subscribe to `recovery_offers` + `services.released_at`.

---

## Phase 10 — End-to-End Verification

Playwright script (`/tmp/browser/uw-stability/`) runs the full matrix:

| Check | Method |
|---|---|
| Partner login no error | OTP flow |
| Status / heartbeat / attendance rows | SQL after login |
| GPS fresh + matches admin map | navigator mock + SQL |
| Assignment builder reactive | slider change → estimate change |
| Today's route visibility | toggle setting → reload |
| Coming Soon registration | submit → row exists |
| Recovery release → candidate offer | RPC trigger + offer row |
| Accept offer → re-optimized route | sequence_no recomputed |
| Admin dashboard KPIs live | realtime row |

Report PASS/FAIL per row honestly. No green-check without executed evidence.

---

## Technical Notes

- All new tables: GRANTs (`authenticated`, `service_role`, `anon` only for public-coming-soon read where needed) before RLS.
- `recovery_offers` realtime added to `supabase_realtime` publication.
- No new client routes — extend existing screens.
- All settings live in `platform_settings`; never hardcoded.
