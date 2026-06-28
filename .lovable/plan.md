
# Urban Wash – Final Business Acceptance Test & Production Readiness

This is a stabilization + one focused new feature (Partner Operations Settings) + verification pass. No redesigns, no refactors.

## Scope decisions (please confirm)

The request is very large. To keep this honest (no fake PASS marks) I'll execute in this order. Tell me if you want to drop or reorder anything.

### Part A — Partner Operations Settings (the only new build)

A new admin route **/admin/settings** is reorganized into tabbed sections, all backed by the existing `platform_settings` table (key/value JSON). No new tables, no new RPCs beyond what already exists (`listSettings`, `updateSetting`).

Tabs and keys (every key editable from Admin; Partner App reads via existing settings query — no client code changes needed beyond exposing keys it already consumes):

1. **Assignment** — min/max cars, min/max days, trial_mode, manual_assignment_enabled, auto_assign_enabled, allow_partner_cancel, allow_partner_rebuild, assignment_lock_days, radius_steps, search_radius_km, radius_increment_km, max_radius_km, marketplace_timeout_sec, offer_timeout_sec, retry_attempts, broadcast_interval_sec
2. **Earnings** — rate_per_car, deep_clean_rate, onetime_rate, interior_rate, exterior_rate, addon_rate, dirty_reward, unavailable_compensation, complaint_deduction, cancel_penalty, reliability_bonus, monthly_bonus, attendance_bonus, corporate_bonus, vip_bonus
3. **Service Visibility** — route_visibility_until (existing) extended with 6/7/8/9 AM + custom_time
4. **Route Optimization** — cluster_first, distance_weight, time_weight, soft_window_weight, hard_window_weight, emergency_weight, locked_weight, corporate_weight, vip_weight, complaint_weight, max_deviation_m, max_travel_km, max_travel_min, default_speed_kmh, avg_service_min
5. **Attendance** — attendance_radius_m, late_tolerance_min, checkin_distance_m, checkout_distance_m, gps_verification, selfie_required, background_tracking
6. **Partner Capacity** — default_cars_per_day, max_working_hours, max_travel_km, max_subscriptions, max_onetime, auto_capacity_calc
7. **Marketplace** — offer_timeout, offer_priority_mode, offer_retry, offer_broadcast, weight_reliability, weight_distance, weight_capacity, weight_urgency, weight_route_impact
8. **Notifications** — notify_offer, notify_assignment, notify_completion, notify_wallet, notify_attendance, notify_reminder, sound_enabled, vibration_enabled, autopopup_enabled
9. **Maps** — map_provider, navigation_mode, traffic_layer, satellite_layer, cluster_view, heat_map, partner_location_interval_sec, customer_refresh_sec, route_refresh_sec

Implementation:
- One migration to seed default values for all new keys (idempotent `ON CONFLICT DO NOTHING`).
- Refactor `src/routes/admin.settings.tsx` to use Tabs + grouped cards. Keep existing `listSettings`/`updateSetting` server fns.
- Where the Partner App already reads a setting (e.g. `route_visibility_until`, `rate_per_car`, `auto_assign_*`), no further wiring needed. Where the Partner App currently hard-codes a value, I will add a one-line read from settings only if the file is already in context — otherwise the key exists in settings and an explicit "wired in next pass" note is included in the final report. **This is the honest tradeoff** — wiring every key into the Partner App is days of work and was not part of the original brief.

### Part B — Business Acceptance Test (live Playwright)

Single end-to-end run on seeded accounts (admin/partner/customer). I'll record screenshots at each milestone and report PASS/FAIL per stage. Where a step needs a real device (push notifications, GPS-based attendance, camera photo capture) it's marked **Requires Physical Device** — these cannot be honestly PASSed from a headless browser.

### Part C — Production Cleanup

Conservative: delete only files/RPCs/imports that grep proves are unreferenced. No "looks unused" deletions. Console errors triaged from the BAT run, not pre-emptively.

### Part D — Management Report

Single document at the end of the turn. Format exactly as requested (PASS / Requires Physical Device / FAIL per module, one recommendation at the bottom).

## What I will NOT do (and why)

- **Will not** redesign Partner App UI to surface every new setting — out of scope ("Do NOT redesign the UI").
- **Will not** mark push notifications, GPS attendance radius, camera-based before/after photos, or background tracking as PASS — these are device-dependent. They get **Requires Physical Device**.
- **Will not** mass-delete "possibly unused" code. Only proven-dead.
- **Will not** invent new RPCs for settings — existing ones handle it.

## Estimated output

~1 migration, ~1 rewritten admin.settings.tsx, Playwright BAT script + screenshots, a handful of cleanup deletions, final report.

**Confirm and I'll execute, or tell me what to cut.**
