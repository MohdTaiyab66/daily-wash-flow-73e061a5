
# Daily Shine — Persistent Assignments & Time-Gated Daily Route

Today Daily Shine behaves like a marketplace: the partner rebuilds the assignment each day, sees all future customers up front, and re-accepts customers through offers. We already have most of the primitives (`assignments` with `start_date/end_date/duration_days`, `subscription_assignment_queue.lock_until/locked_partner_id`, `services` per day, `platform_settings`). The change is behavioural: **lock once, generate daily, gate visibility, honour it everywhere**.

## 1. Behaviour rules (product)

- Partner builds a single **assignment period** (default 30 days, admin-configurable 7–90).
- On accept, every currently-queued customer for that partner is **locked to that partner for the full period** (`subscription_assignment_queue.locked_partner_id`, `lock_until = assignment.end_date`).
- Each day a scheduler generates that day's `services` rows for every locked customer of every active assignment.
- Partner does **not** see tomorrow's route until `shift_start − route_visibility_hours` (admin setting, default 6h). Before that, "Today's Route" hides stops and shows a countdown; "My Assignment" shows only aggregates.
- Marketplace/offers path skips customers already locked to a partner whose assignment covers the target date. It only fires for genuinely new / unassigned customers.
- New Daily Shine customer created by admin → auto-merged into a matching active assignment (same area, capacity remaining), otherwise queued to marketplace.
- Cancellations / address-out-of-coverage / partner unavailable → row removed from tomorrow's generation; today's remaining stops handled by DAR as today.

## 2. Data model changes (single migration)

- `assignments`: add `route_visibility_hours int` (nullable, falls back to global setting), `auto_renew boolean default false`, `hours_per_day numeric` (2–6, the "hours picker"), `shift_start_time text` (already `expected_start_time` — reuse).
- `platform_settings` seed keys (via `supabase--insert`, not migration):
  - `route_visibility_hours` = 6
  - `assignment_min_days` = 7, `assignment_max_days` = 90, `assignment_default_days` = 30
  - `assignment_hours_options` = `[2,3,4,5,6]`
- No new tables. `services` remains the per-day materialisation.

## 3. Server logic

### 3a. Accept flow (existing `respond_subscription_offer` / assignment builder)
- When the partner locks in the assignment, set `locked_partner_id` and `lock_until = end_date` on every queue row we assign to that partner in that build.
- Skip queue rows whose `lock_until >= today` and `locked_partner_id <> me` when computing offers.

### 3b. Daily route generation — new SQL function `generate_daily_services(p_date date)`
- For each `assignments` row with `status='active'` and `start_date <= p_date <= end_date`, and where `p_date`'s weekday ≠ the partner's weekly off:
  - For every `subscription_assignment_queue` row with `locked_partner_id = assignment.partner_id` and `lock_until >= p_date` and `status = 'assigned'`:
    - Upsert a `services` row `(assignment_id, partner_id, customer_id, vehicle_id, scheduled_date=p_date, status='pending', rate_per_car)` — idempotent on `(assignment_id, customer_id, scheduled_date)` (add partial unique index).
- Runs from a new cron `src/routes/api/public/cron/generate-daily-routes.ts` scheduled at 00:05 IST; also invoked on assignment accept for today (if `visibility` already open) and on admin add/remove of a customer.

### 3c. Route visibility gating
- New server fn `getTodayRouteVisibility(partnerId)` → returns `{ visible: bool, unlockAt: ISO }` computed from `assignment.shift_start_time`, `route_visibility_hours`, and `now()`.
- `app/live` route (Today's Route) and `getMyAssignment`:
  - If not visible yet, return `services: []` + `unlockAt` so UI can show countdown.
  - After unlockAt, return today's generated services as usual.

### 3d. Offer/marketplace filter
- `offer_next_for_queue` (or its caller) — skip already-locked queue rows for the assignment window. If the marketplace list previously showed all locked customers to the partner-owner, it should still show (it's theirs), but should NOT re-offer.

### 3e. Admin add/remove customer
- Admin "assign customer to partner" or create-DS-subscription flow (existing) → after inserting queue row, if a matching active assignment exists, set `locked_partner_id`+`lock_until` immediately and call `generate_daily_services(today)` for that partner so the row appears in either today's route (if visibility open and shift not started) or tomorrow's.
- Cancel/remove → set queue.status='cancelled' and delete pending future `services` rows.

## 4. Partner UI

- `_authenticated/app/assignments.tsx` (builder): add **Hours per day picker (2/3/4/5/6)** and **Duration picker** (min/default/max from settings). Copy: "Locks your route for N days — no rebuilding."
- `_authenticated/app/my-assignment.tsx`: header shows `Remaining days`, `Auto-renew` toggle if enabled by admin, and `Today's route: Ready | Unlocks at HH:MM`.
- `_authenticated/app/live.tsx` (Today's Route): if `unlockAt > now`, render a "Route unlocks at HH:MM" empty state with countdown instead of stops.
- Hide the "Build assignment" CTA whenever an active assignment exists that covers today. Show "My Assignment" instead.

## 5. Admin UI

- `admin.settings.tsx` → new "Assignment" section: `Route visibility hours` (dropdown 1/2/3/4/5/6/8/12/24), `Min/Max/Default duration days`, `Hours-per-day options` (multi-select), `Auto-renew allowed` toggle.
- `admin.marketplace.tsx`: hide locked queue rows from the awaiting/offered tabs (they belong to a partner already); surface them in a new "Locked" chip on the queue detail page.

## 6. DAR interaction
- DAR path unchanged for today. When DAR reassigns a stop temporarily, do NOT overwrite `locked_partner_id`/`lock_until` — just create the day's `services` row against the DAR partner. Tomorrow's generation reads the queue lock and returns the customer to the original partner. Admin "permanent reassign" is the only path that rewrites the lock.

## 7. Files touched

- **Migration**: 1 file — add columns, partial unique index on `services(assignment_id, customer_id, scheduled_date)`, `generate_daily_services()` fn, tweak `offer_next_for_queue` to skip locked rows.
- **Cron route**: `src/routes/api/public/cron/generate-daily-routes.ts` (+ pg_cron schedule inserted via `supabase--insert`).
- **Server fns**: extend `src/lib/assignment.functions.ts` (visibility, hours/duration in accept), new `src/lib/daily-shine.functions.ts` for admin add/remove helpers if needed.
- **Partner UI**: `src/routes/_authenticated/app.assignments.tsx`, `.../app.my-assignment.tsx`, `.../app.live.tsx`.
- **Admin UI**: `src/routes/admin.settings.tsx`, `src/routes/admin.marketplace.tsx` (+ detail).
- **Types regen**: `src/integrations/supabase/types.ts` after migration.

## 8. Acceptance mapping

- Accept once → no rebuild for `duration_days` days: enforced by queue lock + skip-locked in offer engine + UI hides builder.
- Route appears only within visibility window: enforced by `getTodayRouteVisibility` gate on both `my-assignment` and `live`.
- Admin adds customer → next-day auto-appear: enforced by generator + immediate lock + regen call.
- DAR still works: today's `services` row assigned to DAR partner; queue lock untouched.
- Marketplace / Coverage Manager / Wallet / Notifications unchanged.

## 9. Out of scope / follow-ups

- Auto-renew billing flow (only the flag + expiry banner ship now).
- Multi-partner splitting within one assignment.
- Historical migration of already-in-flight assignments — new rules apply from deploy; existing active assignments get `locked_partner_id` back-filled by a one-shot admin action in the migration.
