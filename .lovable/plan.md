# Route Manager — Production Operations Dispatch

The UI exists. This plan wires every action to the database, partner app, customer app, and maps in realtime, then validates end-to-end. Delivered in 4 passes so you can review between each.

## Pass 1 — Data foundation (DB + RPCs)

Migration adds what's missing for safe edits, conflict checks, version history, and audit:

- `services`: add `eta_at timestamptz`, `travel_min int`, `distance_km numeric`, `last_sequence_change_at timestamptz`, `last_sequence_change_by uuid`.
- `route_change_log`: ensure `old_eta`, `new_eta`, `old_position`, `new_position`, `reason` columns.
- `route_snapshots`: ensure `version int`, `reason text`, `metrics jsonb` (distance/eta/stops), `created_by`.
- `customer_notifications`: reuse existing — emit "ETA updated" rows.
- New RPCs (`SECURITY DEFINER`, gated by `has_role(admin)` OR `has_role(ops_manager)`):
  - `admin_route_draft_validate(p_partner, p_date)` → returns conflicts: duplicates, missing coords, locked-but-moved, out-of-area, impossible ETA, partner mismatch.
  - `admin_route_draft_preview(...)` → returns `{before:{distance,eta,stops}, after:{...}, diffs:[{customer,old_pos,new_pos,old_eta,new_eta}]}`.
  - `admin_route_draft_save(..., p_reason)` → wraps: create snapshot v(N+1), apply sequence + ETA + cluster + priority + locks, write `route_change_log` per moved row, write `customer_notifications` where ETA shift ≥ threshold, return summary.
  - `admin_route_remove_stop(p_service_id, p_mode)` where mode ∈ `today_only|cancel|transfer`.
  - `admin_route_bulk(p_action, p_service_ids, p_payload)` for bulk move/priority/lock/unlock/delete/emergency/reassign.
  - `admin_route_history(p_partner, p_date)` → list of snapshot versions w/ metrics & editor.
  - `admin_route_search_customers` — extend filter: active Daily Shine for date, includes vehicle model + society + subscription.
  - Reliability: `admin_route_reassign` already exists — extend to recompute both routes' sequences and ETAs in same txn and write notifications.

Realtime publication: ensure `services`, `route_drafts`, `route_snapshots`, `route_change_log`, `customer_notifications`, `partner_notifications` in `supabase_realtime`.

## Pass 2 — Save pipeline + realtime fan-out

Frontend wiring in `admin.route-manager.tsx`:

- `Save Manual Route` calls `admin_route_draft_validate` → if issues, open Conflicts dialog (block save).
- Then `admin_route_draft_preview` → open `RoutePreviewDialog` with before/after metrics + per-customer ETA diffs + confirm.
- On confirm → `admin_route_draft_save({reason})`. Snapshot written first.
- Insert row into `partner_notifications` (`type='route_updated'`) for affected partners; pg trigger on `services` UPDATE already broadcasts via Realtime.
- Customer side: rows in `customer_notifications` for affected ETAs.

Partner app: add a small `usePartnerRouteSync()` hook subscribing to `services` rows where `partner_id = me` for today; on change invalidate route query and show toast "Route updated by Operations". Auto-refresh map, sequence, ETA, navigation.

Customer app: extend `AwaitingPartnerBanner` / "My Plan" to subscribe to `customer_notifications` for current user; show "Estimated arrival updated → new ETA. Reason: Operations optimized today's route."

## Pass 3 — Editor UX completion

- Add Customer (+): fix `admin_route_search_customers` to honor date + Daily Shine + vehicle/model/society/subscription filters; insertion offers position picker (Above/Below/End/Beginning/Specific #).
- Cross-partner transfer: dialog with preview (impact on both routes) → `admin_route_reassign` w/ position arg.
- Remove customer: dialog with 3 modes wired to `admin_route_remove_stop`.
- Bulk action bar: hook to `admin_route_bulk`.
- Priority change: writes to draft immediately; "Emergency" auto-promotes to nearest valid position client-side and re-runs draft preview on demand.
- Lock: client respects + DB honors during all `optimizeRoute`/`admin_optimize_all` (filter locked rows from reorder set).
- Undo/Redo: already in `route-draft.ts` — wire to draft snapshots so each save bumps history baseline. Add "Restore Morning Route", "Restore Auto-Optimized", "Restore Yesterday" buttons calling `admin_route_restore_snapshot` with version selector.
- Route History tab: list versions from `admin_route_history`, rollback button per version.
- Permissions: gate Save / mutate buttons by `role === admin || ops_manager`; dispatchers get read+search only.

## Pass 4 — Validation

Run the user's scenario as an automated check via `psql` + Playwright headless:

1. Load Partner A's real route for today.
2. Drag stop #12 → #4 (DB sequence updates in draft).
3. Add a real Daily Shine customer at stop #8.
4. Transfer one stop to Partner B.
5. Save with reason.

Verify, asserting each:

- `services` rows updated (sequence + ETA).
- New `route_snapshots` row (version N+1).
- `route_change_log` entries for every move.
- `partner_notifications` rows for A and B.
- `customer_notifications` rows for customers whose ETA shifted ≥ threshold.
- Partner app live preview shows new sequence without manual refresh (Playwright).
- Customer app shows ETA update banner.
- Map markers + polyline reflect new order.

Report PASS / FAIL per item with the exact missing link if any.

## Technical notes

- Snapshot is created **inside** `admin_route_draft_save` before mutating, guaranteeing rollback safety.
- ETA threshold from `platform_settings.customer_eta_shift_threshold_min` (already seeded).
- All RPCs `SECURITY DEFINER`, role check first, `SET search_path = public`.
- Heavy compute (ETA / travel_min) uses the existing `route-optimize.ts` cluster engine called from the RPC via a small SQL wrapper that receives precomputed values from the client `preview` step (avoids putting Haversine in PL/pgSQL).
- No new tables — reuses `route_snapshots`, `route_change_log`, `customer_notifications`, `partner_notifications`.

## Out of scope (will not change)

- Visual redesign of cards/tabs (UI is approved).
- FCM payload format (already shipped).
- Route optimizer scoring weights (already tuned).

Approve and I'll start Pass 1 (migration + RPCs). Each pass ends with a brief "ready for next pass" message.
