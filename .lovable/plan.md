
# Urban Wash Partner App V4 — Implementation Plan

Scope: modify the existing app. Keep branding (logo, orange/black/white) and the 5-tab navigation. No rebuild.

## 1. Online/Offline Gating
- Persist `is_online` on `partners` (already exists) and read it via a small React context/hook (`useOnlineStatus`).
- Wrap protected tabs/pages (Assignments, Route/Map, Service detail) with a guard component: if offline, render an "You're offline" state with a CTA to go online. Allowed offline: Home summary, Earnings, Rewards, History, Training, Profile, Support.
- Home toggle flips `is_online` and invalidates queries; toggling offline hides map pins immediately.

## 2. Database changes (single migration)
New / altered tables and columns:
- `assignments`: add `duration_days`, `start_date`, `end_date`, `working_days`, `expected_start_time`, `radius_km` (rename/derive), `cars_per_day` (= target_cars). Keep one active assignment spanning N days instead of generating daily.
- `services`: already daily — generated for each working day (skip Mondays) across the assignment window for the same customer set.
- `service_analytics`: per-service `travel_seconds`, `cleaning_seconds`, `total_seconds`, `area`, `partner_id`, `service_id`.
- `dirty_vehicle_reports`: `service_id`, `partner_id`, `reason`, `notes`, 4 photo paths.
- `parking_reports`: `service_id`, `partner_id`, `reason`, `notes`, `photo_path`.
- `unavailability_penalties`: `partner_id`, `assignment_id`, `date`, `amount` (₹250 + day earnings deducted).
- `payouts`: extend with `security_reserve_amount`, `released_at`, `week_start`, `week_end`. Add rule: first payout only after partner's first 15 active days.
- `service_photos`: add `stage = 'before'` (single) + `stage = 'after'` (4 angles). Adjust unique constraint to allow exactly 1 before photo (no angle).
- All new tables: explicit GRANTs + RLS scoped to `auth.uid()`, plus `service_role` full access.

New RPCs:
- `preview_assignment(p_cars int, p_duration int)` → returns `{daily_earnings, total_earnings, working_days, estimated_radius_km, estimated_hours, expected_start_time, expected_end_time}` using progressive radius simulation against partner's home.
- `accept_assignment_v2(p_cars int, p_duration int)` → progressive radius search (1→2→3→5 km), priority order: preferred_time, distance, area density; locks the customer set for `duration_days`; generates `services` for each non-Monday in window with `sequence_no` from nearest-neighbor; sets `expected_start_time` from cars-count rules.
- `cancel_assignment(p_assignment_id)` → marks assignment cancelled, applies ₹250 + day's earnings penalty, frees remaining services for reassignment.
- `service_efficiency_summary(p_partner_id, p_range)` → travel/cleaning/avg per car/per area.

## 3. Assignment Builder screen (`app.assignments.tsx`)
Replace fixed offer cards with a builder:
- Two shadcn `Slider`s: Cars (15–30, step 1), Duration (7–30, step 1).
- Live calculation card (debounced call to `preview_assignment`): daily earnings (`cars × 17`), working days (exclude Mondays), total earnings, estimated radius, estimated hours, expected start window.
- Assignment Rules panel (static copy).
- Sticky "Accept Assignment" button → `accept_assignment_v2`, then route to `/app/route`.
- If active assignment exists: show summary card + "View Today's Route".

## 4. Home screen redesign (`app.index.tsx`)
- Remove customer list.
- Top: online/offline toggle.
- Assignment Summary card: area, assigned/completed/remaining, distance remaining, ETA, "Day X of Y".
- Stats row: today's earnings, rating, lifetime cars, hours worked today, distance today, partner level.
- Primary CTA: **View Today's Route** → `/app/route`.

## 5. Map-first Route page (NEW `app.route.tsx`)
- Visible only when ONLINE + active assignment + within service window.
- Google Maps JS API via Lovable Google Maps Platform connector (browser key + gateway for server-side geocoding/directions). User to be prompted to link the connector.
- Markers: orange=pending, green=completed, red=high priority (required-before within 30 min), grey=unavailable. Hide on offline/window close/completion.
- Swipe-up bottom sheet (`vaul`/`Drawer`): assignment KPIs + ordered customer cards (Name, vehicle, plate, area, preferred time, required-before, distance, buttons: Navigate / Call / Start / Report).

## 6. Service Verification flow (`app.service.$id.tsx`)
- Replace 8-photo flow with: 1 Before photo → cleaning → 4 After photos (front/rear/left/right). Camera-only (`capture="environment"`).
- Timer: start on first photo, stop on completion. Persist `started_at`, `completed_at`, computed durations into `service_analytics`.
- New buttons: "Report Dirty Vehicle" (4 live photos + reason) and "Parking Issue" (1 photo + reason). Both via dialogs writing to the new tables.

## 7. Earnings screen (`app.earnings.tsx`)
- Tabs: Today / Week / Month / Lifetime. For each: cars, hours, distance, total, avg/day.
- Payout policy panel: next payout date (next Monday after first 15 days), next amount, payout history list.

## 8. History screen (NEW `app.history.tsx`)
- Filters: Today / Week / Month / Custom range (date picker).
- Daily rows: cars, hours, distance, earnings, area. Tap → detail sheet with per-service breakdown.
- Add to bottom nav? Spec says keep 5 tabs; place History under Profile menu instead to preserve nav.

## 9. Rewards / Profile / Training
- Rewards: keep, add Monthly Challenges, Attendance Rewards, Rating Rewards stub cards.
- Profile: add Partner ID, joining date, attendance %, verification chips (Aadhaar/PAN/Bank), links to Training Center, SOP Library, Help & Support, Referral, Policies, Logout, History.
- Training Center (NEW `app.training.tsx`): list `training_modules` rows (already seeded) with progress; supports SOP docs + video tutorials (markdown/video URL fields).

## 10. Google Maps integration
- Link Google Maps Platform connector (gateway). Use browser key for Maps JS + Places (New); use gateway server fns for Geocoding / Routes / Distance Matrix used by `preview_assignment` and `accept_assignment_v2` route ordering.
- Server fns under `src/lib/maps.functions.ts` (call gateway with `LOVABLE_API_KEY` + connection key).

## 11. Files touched
- New: `src/routes/_authenticated/app.route.tsx`, `app.history.tsx`, `app.training.tsx`, `src/lib/maps.functions.ts`, `src/hooks/use-online.ts`, `src/components/OfflineGuard.tsx`.
- Modified: `app.tsx` (guards), `app.index.tsx`, `app.assignments.tsx`, `app.earnings.tsx`, `app.profile.tsx`, `app.service.$id.tsx`.
- Migration: new tables + RPCs + RLS + GRANTs.

## 12. Out of scope (architecture-ready only)
Customer app, admin/supervisor dashboards beyond existing, auto reassignment automation, AI optimization, multi-city, dynamic pricing.

---

## Confirmations needed before build
1. **Google Maps**: OK to prompt linking the Google Maps Platform connector now? Without it the map page falls back to a list view.
2. **History tab placement**: Keep 5-tab bottom nav and put History inside Profile, or swap one tab (e.g., Rewards) for History?
3. **Existing data**: OK to drop today's generated `services` so the new builder/locked-customer model owns them cleanly? (Pilot data only.)
