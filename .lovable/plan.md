# Route Manager – Manual Operations Mode (Trial)

Transform `/admin/route-manager` into a full manual cockpit. The AI optimizer keeps running in the background but Operations can override any partner's route at any time. Nothing syncs to the partner app until the admin clicks **Save Route**.

## 1. Database (one migration)

New / changed fields:

- `partners`: `manual_mode_enabled boolean default false`, `manual_mode_since timestamptz`, `manual_mode_by uuid`.
- `services`: `priority text` enum-checked (`normal|emergency|vip|complaint|corporate|repeat|high`), `priority_set_by uuid`, `priority_set_at timestamptz`. (`is_emergency`, `locked_position`, `manual_sequence_no` already exist.)
- `platform_settings`: rows `trial_operations_mode` (bool), `customer_eta_shift_threshold_min` (int, default 15).

New tables:

- `route_drafts` — per (partner_id, service_date) working copy of stop order before Save. Columns: `partner_id`, `service_date`, `payload jsonb` (array of `{service_id, sequence, locked, priority, manual_inserted_from_partner}`), `updated_by`, `updated_at`. Unique `(partner_id, service_date)`.
- Reuse existing `route_change_log` for the audit trail; add `action` values `insert|reorder|move_up|move_down|lock|unlock|priority|reassign|bulk|save|restore|resume_ai`.
- Reuse existing `route_snapshots` for "Morning Route" / "Auto Route" / "Saved" versions; add `kind` values `morning|auto|manual_saved|preview`.

New RPCs (`SECURITY DEFINER`, admin/ops_manager only):

- `admin_route_draft_get(partner_id, date)` → returns draft if present, else current live order.
- `admin_route_draft_set(partner_id, date, payload, reason)` → upsert draft + log entry. Does NOT touch `services`.
- `admin_route_draft_save(partner_id, date, reason)` → write payload → `services.manual_sequence_no`, `locked_position`, `priority`; snapshot kind `manual_saved`; clear draft; set `manual_mode_enabled=true`; broadcast realtime.
- `admin_route_draft_discard(partner_id, date)`.
- `admin_route_search_customers(query, date)` → searches active Daily Shine customers by name/phone/vehicle/society/area/subscription id; flags `currently_assigned_to`.
- `admin_route_insert_customer(partner_id, date, service_id|customer_id, position, reason)` — works on the draft.
- `admin_route_reassign(service_id, to_partner_id, position, reason)` — moves service across partners (draft on both sides).
- `admin_route_resume_ai(partner_id)` — unset manual mode, trigger optimizer.
- `admin_route_restore_snapshot(snapshot_id, reason)`.

Realtime: add `route_drafts`, `partners` (already), `services` (already) to `supabase_realtime` if missing.

## 2. Frontend (`src/routes/admin.route-manager.tsx` + new components)

iPhone-Clock-inspired editing UX:

- **Top-right "+" button** in Stops tab → `AddCustomerSheet` with debounced search, type filter chips (Unassigned / On this route / Other partner), shows priority badge + current partner; insert → appends to draft at end or chosen position.
- **Drag handles (☰)** on every row using `@dnd-kit/sortable` (already installed).
- **Row controls**: ⬆ ⬇, kebab menu with `Insert Above`, `Insert Below`, `Lock`, `Set Priority`, `Move to Partner`, `Remove`.
- **Multi-select**: checkbox per row + sticky `BulkActionBar` (Move, Delete, Reassign, Lock/Unlock, Priority, Time Window).
- **Sticky Save Bar**: only renders when draft differs from live → "Unsaved Changes" + Cancel / Preview Route / Save Route.
- **Manual Mode banner** at top: "Manual Mode Enabled" with `Resume AI`, `Optimize Remaining Stops`, `Optimize Entire Route`.
- **Undo / Redo**: client-side stack of draft payloads (also `Restore Auto Route`, `Restore Morning Route` from snapshots).
- **Recalc on every change**: reuse `admin_route_dashboard` against the draft payload via a new `admin_route_dashboard_preview(payload)` variant so ETA/distance/efficiency update live without saving.
- **History drawer**: lists `route_change_log` rows; each restorable snapshot has "Restore".

New component files:

- `src/components/admin/route/AddCustomerSheet.tsx`
- `src/components/admin/route/StopRow.tsx` (drag handle, up/down, menu, multi-select, priority chip)
- `src/components/admin/route/BulkActionBar.tsx`
- `src/components/admin/route/SaveBar.tsx`
- `src/components/admin/route/ManualModeBanner.tsx`
- `src/components/admin/route/HistoryDrawer.tsx`
- `src/lib/route-draft.ts` — pure helpers (apply ops, compute diff, undo/redo stack).

## 3. Partner & customer side effects (on Save only)

- Partner live view (`app.live.tsx`) already subscribes to `services` realtime → shows a one-time banner "Route Updated by Operations" with changed stops highlighted (added: `changed_at` field stamped on save, pulse for 60s).
- Customer ETA: server-side trigger after save compares previous vs new ETA; if shift > `customer_eta_shift_threshold_min`, insert `customer_notifications` row "Your wash time has shifted to …".

## 4. Trial Mode

- `platform_settings.trial_operations_mode = true` by default.
- When on: AI optimizer skips partners with `manual_mode_enabled=true` (already; we wire it through `pick_scored_partner_for_queue` and morning recompute job).
- Toggle in `/admin/settings`.

## 5. Permissions

All new RPCs require `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'ops_manager')`.

## 6. Out of scope (next pass if requested)

- Time-window editor UI (the bulk action exposes the field but the dedicated picker can land later).
- Mobile-tablet polish beyond responsive Tailwind defaults.

---

### Implementation order

1. Migration (tables, columns, RPCs, settings rows).
2. `route-draft.ts` helpers + `useDraft` hook with undo/redo.
3. `AddCustomerSheet`, `StopRow`, `BulkActionBar`, `SaveBar`, `ManualModeBanner`, `HistoryDrawer`.
4. Wire into `admin.route-manager.tsx` Stops tab.
5. Hook partner banner + customer ETA notification trigger.
6. Settings toggle for Trial Mode.
