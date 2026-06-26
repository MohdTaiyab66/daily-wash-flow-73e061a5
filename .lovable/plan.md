# Route Manager — Operations Control Center

Transform `/admin/route-manager` from a simple drag-list into the morning operations cockpit. Build in 4 phases so each phase is shippable.

## Phase 1 — Data foundation (DB + RPCs)

**New tables**
- `route_change_log` — audit trail. Columns: `id, partner_id, service_id, date, actor_id, actor_name, action` (`move|lock|unlock|emergency|reassign|remove|recalculate|manual_save|optimize_all`), `reason, old_value jsonb, new_value jsonb, created_at`.
- `route_snapshots` — keeps "original optimized", "current", and every accepted recalculation per partner/day for history + diff. Columns: `id, partner_id, date, kind` (`original|recalc|manual`), `sequence jsonb` (ordered service ids + computed metrics), `metrics jsonb`, `created_by, created_at`.

**Columns added**
- `services`: `unavailable_at timestamptz`, `delay_reason text` (already has status/locked/emergency/manual_sequence/cluster_id from earlier turns).
- `partners`: ensure `photo_url, current_lat, current_lng, last_seen, status` exist (most already do — additive only if missing).

**New / updated RPCs (SECURITY DEFINER, admin-gated via `has_role`)**
- `admin_route_dashboard(_partner_id, _date)` → returns dashboard JSON: counts, ETAs, efficiency score, cluster count, backtracking count, fuel estimate, distance, driving/cleaning time.
- `admin_route_timeline(_partner_id, _date)` → ordered stops with `eta, leg_distance_km, leg_minutes, service_minutes, cluster_id`.
- `admin_optimize_all(_date)` → fleet-wide rebalance: pulls every partner's pending stops, regroups by geohash cluster, reassigns clusters to nearest under-capacity partner, returns per-partner before/after metrics. Writes a `route_snapshots` row per partner with `kind='recalc'` pending acceptance.
- `admin_accept_recalc(_snapshot_id)` / `admin_reject_recalc(_snapshot_id)`.
- `admin_remove_service(_service_id, _reason)`.
- `admin_log_route_action(...)` helper called by every mutating RPC.
- Existing `admin_reorder_services`, `admin_lock_service`, `admin_reassign_service`, `admin_force_recalculate` keep working but now also write to `route_change_log` and produce a `route_snapshots` diff.

**Realtime**
- Add `services`, `partners`, `route_change_log`, `route_snapshots` to `supabase_realtime` publication (skip ones already added).

## Phase 2 — UI shell

Rewrite `src/routes/admin.route-manager.tsx` into a tabbed cockpit. Top bar keeps Date + Partner + "Optimize All Routes" button.

**Top dashboard strip** (above tabs)
Partner photo, name, online/offline pill, current location chip, assigned/completed/pending/unavailable counts, dirty-report count, estimated distance, driving time, cleaning time, finish ETA, efficiency score, cluster count, backtracking count, fuel estimate (₹). Data from `admin_route_dashboard`.

**Tabs**
1. **Map** — Google Maps via existing browser key. Partner pin, optimized polyline, all customers with colour rules (Blue=next, Orange=pending, Green=completed, Red=delayed, Grey=unavailable, Purple=emergency). Cluster polygons (convex hull per cluster_id). Marker click → side sheet with customer details + actions (Navigate, Call, Move, Lock, Emergency).
2. **Timeline** — vertical timeline from "Leave Base" through every stop with ETAs and drive legs.
3. **Clusters** — collapsible cluster cards with counts + remaining time.
4. **Stops** — the existing drag-and-drop list, upgraded with full customer card (vehicle photo, registration, exact-time badge, distance from previous, ETA, complaint/VIP/reliability/parking badges, all action buttons).
5. **History** — original vs current vs all recalcs, with diff view + activity log feed from `route_change_log`.

**Force Recalculate dialog**
Modal showing Previous vs New: distance, drive time, fuel, efficiency delta. Accept → calls `admin_accept_recalc`; Reject → discards snapshot.

**Optimize All Routes dialog**
Per-partner before/after table with total fleet savings. Accept-all or per-partner accept.

## Phase 3 — Realtime + permissions

- `useEffect` channel subscribed to the four tables; invalidates dashboard/timeline/stops queries on any change. 10s fallback `refetchInterval` for partner location.
- Gate every mutating button behind `has_role('admin')` or new `has_role('ops_manager')` (add `ops_manager` to the `app_role` enum). Read-only admins see view but disabled buttons with tooltip "Requires Operations Manager".
- Sidebar nav already lists Route Manager — keep it; add an "Ops" badge.

## Phase 4 — Polish

- Mobile layout: tabs collapse to a bottom sheet, top dashboard becomes a horizontal scroll of stat chips.
- "Move Assignment" sheet shows target partner capacity, distance delta, ETA delta before confirming.
- Activity log component reused on `admin.marketplace.$id.tsx`.

## Out of scope (separate request if needed)

- Replacing the optimizer math itself — keep `src/lib/route-optimize.ts` as-is; surface its output.
- Push notifications to partners on route change — partner app already subscribes to `services` realtime; the existing `usePartnerHeartbeat` + offer push pipeline covers wake-ups.
- Fuel price configuration UI (use a constant `₹6/km` in `platform_settings.fuel_cost_per_km`, default seeded).

## Technical notes

- All metrics computed server-side in `admin_route_dashboard` using PostGIS-free haversine (already in `route-optimize.ts` pattern) so the client just renders numbers.
- Cluster polygons computed client-side from cluster_id groupings using a simple convex hull util (no new deps).
- Google Maps loaded with the existing `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, `loading=async`, global `initRouteMap` callback. Use `google.maps.Marker` (not AdvancedMarkerElement).
- New RPCs are additive; existing partner app code keeps working unchanged.
- One migration for tables + columns + enum + RPCs + grants + RLS + realtime publication, in that order.

## Deliverables checklist

- [ ] Migration: tables, enum, RPCs, grants, RLS, realtime
- [ ] `src/routes/admin.route-manager.tsx` rewritten with tabs + dashboard
- [ ] `src/components/admin/route/*` — `DashboardStrip`, `RouteMap`, `RouteTimeline`, `ClusterPanel`, `StopList` (current row component lifted out), `RecalcDiffDialog`, `OptimizeAllDialog`, `ActivityLog`, `CustomerSheet`
- [ ] `src/lib/route-metrics.ts` — shared client helpers (convex hull, formatters)
- [ ] `ops_manager` role gating in `admin-middleware.ts` + UI button gates
