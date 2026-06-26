# Daily Shine Route Optimizer Redesign

## Goal
Shift from deadline-bucket routing to **cluster-first, distance-optimal** routing. Treat "Before X AM" as soft preferences (penalty, not gate). Only `exact_time_service` is a hard constraint. Add an Admin Route Manager with drag-and-drop, locks, emergency insertion, partner reassignment, and realtime partner sync.

---

## 1. Data model changes (migration)

**`customers`**
- `time_window_type text default 'soft'` — `'soft' | 'exact'`
- `exact_time time` — only used when type = `exact`

**`services`**
- `locked_position boolean default false` — admin lock for the day
- `manual_sequence_no int` — admin-set override; takes precedence over optimizer
- `is_emergency boolean default false`
- `cluster_id text` — assigned by optimizer (e.g. area+geohash5)
- `reassigned_from uuid references partners(id)` — audit when admin moves between partners

**`platform_settings`** (new keys, JSON)
- `route_optimizer_weights` — `{ route_impact, distance, travel_time, preferred_time, continuity, reliability, vip, complaint }` default `{40,20,10,8,7,6,5,4}`
- `route_soft_window_penalty_per_min` — default `0.5`
- `route_cluster_radius_km` — default `0.8`

No new tables; reuse `services` + realtime publication (already on).

## 2. Optimizer rewrite (`src/lib/route-optimize.ts`)

Replace deadline-bucket + nearest-neighbor with **cluster-first scored insertion**:

1. **Cluster** pending stops by geohash-5 (~0.6 km cell) or DBSCAN with `route_cluster_radius_km`.
2. **Order clusters** by distance from current cursor (start = partner GPS or first hard-time stop).
3. Within a cluster, order by nearest-neighbor; never leave a cluster with stops remaining unless a hard-time stop elsewhere is about to be missed.
4. **Hard constraints**: `time_window_type='exact'` stops are pinned — schedule backward from `exact_time` minus 10 min/stop ETA and insert their cluster at the matching time slot.
5. **Soft preferences**: compute predicted arrival; if later than preferred window, add `penalty_per_min * minutes_late` to the stop's score. Does not block ordering.
6. **Scoring** per candidate next stop:
   `score = w.route_impact*Δkm_saved + w.distance*-km + w.travel_time*-min + w.preferred_time*-late_penalty + w.continuity*same_cluster + w.reliability*partner_priority + w.vip*vip_flag + w.complaint*complaint_flag`
7. **Locked/manual** stops bypass scoring and slot at their fixed index.
8. **Emergency** stops insert at the nearest feasible point after `now()`.

Export:
- `optimizeRoute(stops, from, opts)` — full ordering
- `pickNextStop(stops, from, opts)` — recomputed after every completion (live route already invalidates on service status change)

## 3. Live route page

`src/routes/_authenticated/app.live.tsx`:
- Call `optimizeRoute` with new options; show cluster headers (`Aliganj • 4 cars`) instead of priority chips.
- Replace "Priority" badge with `Exact time` (hard) / `Prefers before 9 AM` (soft).
- Already re-fetches on realtime — pickNext re-runs on each completion automatically.

## 4. Admin Route Manager (new route)

`src/routes/admin.route-manager.tsx`:
- Partner picker + date picker (default today).
- Drag-and-drop list using `@dnd-kit/core` + `@dnd-kit/sortable` (lightweight, already-common).
- Per-row actions: **Lock**, **Unlock**, **Mark Emergency**, **Move to partner…** (dialog), **Remove from day**.
- Toolbar: **Re-optimize**, **Insert emergency job** (search customers/vehicles).
- Saves to `services` (`manual_sequence_no`, `locked_position`, `is_emergency`, `partner_id`).
- Writes to `assignment_changes` for audit.

RPCs (admin-only via `requireAdmin`):
- `admin_reorder_services(partner_id, date, ordered_ids[])`
- `admin_lock_service(service_id, locked bool)`
- `admin_reassign_service(service_id, new_partner_id)`
- `admin_insert_emergency(partner_id, vehicle_id, position)`
- `admin_force_recalculate(partner_id, date)` — clears `manual_sequence_no` for unlocked stops and bumps `updated_at` to trigger partner realtime refresh.

## 5. Realtime sync

`services` is already in `supabase_realtime`. Confirm via migration (idempotent `ADD TABLE` guarded). Partner's `app.live.tsx` already uses `useRealtimeInvalidation(["services", ...])` — new admin edits propagate automatically.

## 6. Settings UI

`src/routes/admin.settings.tsx`: add a "Route optimizer" card to edit weights, penalty, cluster radius (writes `platform_settings`).

---

## Technical notes

- Geohash via small inline helper (no dep) — 5-char precision ≈ 0.6 km cell.
- `@dnd-kit/core` + `@dnd-kit/sortable` install required.
- Backwards compatible: existing rows default `time_window_type='soft'`, so old "Before X AM" data behaves as soft preference without backfill.
- `pick_scored_partner_for_queue` (marketplace) is unrelated and untouched.

## Out of scope
- Multi-day planning, traffic prediction, partner shift breaks — keep current heuristics.

Approve to implement.