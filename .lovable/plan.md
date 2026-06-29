# Phase 1.5 — Settings Cleanup + Phase 2 — Dynamic Assignment Recovery

Two sequential phases. Phase 1.5 lands first and is verified before DAR begins.

---

## Phase 1.5 — Zero Fake Settings

Goal: every editable Partner Operations setting must either drive runtime behavior or be hidden from the Admin UI. No "placeholder" state remains.

### Triage of the 12 dormant keys (from Phase 4 audit)

**Wire to runtime (Option A) — cheap, observable effects:**
1. `notify_offer`, `notify_assignment`, `notify_completion`, `notify_wallet`, `notify_attendance`, `notify_reminder` → gate inserts in `partner_notifications` / push dispatch by category. Add a `category` column check in the notify helper.
2. `sound_enabled`, `vibration_enabled` → expose via `get_partner_ui_prefs` RPC; partner shell reads and applies to OfferPopup + toast.
3. `allow_partner_cancel` → already partly wired; enforce in `cancel_assignment` RPC (raise if false).
4. `gps_verification`, `selfie_required` → enforce in attendance check-in RPC (reject without coords / selfie URL).

**Hide (Option B) — not feasible to implement now without scope creep:**
5. `background_tracking` → requires native capability; hide from UI with a tooltip "Coming with native app".
6. `auto_capacity_calc` → depends on historical analytics not yet built; hide.
7. `heat_map` (maps tab) → hide until Coverage Manager heat layer ships.

### Deliverables
- Migration: add `category` to notification insert triggers; add guards in `cancel_assignment`, attendance RPCs.
- New RPC: `get_partner_ui_prefs()` returns sound/vibration/notify toggles.
- Edit `src/routes/admin.settings.tsx`: remove hidden keys from SECTIONS arrays.
- Edit `OfferPopup.tsx` + partner shell: read prefs, apply sound/vibration.
- Final audit doc: `/mnt/documents/UrbanWash_Phase1.5_Settings_Final.md` classifying all 39 as **Runtime Active / Hidden / Removed**.
- Playwright verification: toggle 3 representative settings (notify_offer OFF, sound_enabled OFF, allow_partner_cancel OFF) and observe behavior change.

---

## Phase 2 — Dynamic Assignment Recovery (DAR)

New operational module. Triggers when a partner can no longer serve their Daily Shine customers, releases those customers, finds nearby partners, offers them as "extra cars", reoptimizes routes, keeps customers unaware.

### 2.1 Database

New tables:
- `dar_events` — one row per recovery trigger. Columns: `partner_id`, `reason` (`absent|unavailable|cancelled|offline|suspended`), `triggered_at`, `affected_service_ids[]`, `status` (`pending|offered|recovered|partial|expired`), `recovered_count`, `resolved_at`.
- `dar_offers` — per (event, partner) offer. Columns: `event_id`, `partner_id`, `service_ids[]`, `score`, `extra_distance_km`, `extra_time_min`, `extra_monthly_earnings`, `status` (`pending|accepted|ignored|expired`), `sent_at`, `responded_at`, `expires_at`.

New columns:
- `services.recovery_event_id`, `services.original_partner_id` for audit.

### 2.2 RPCs / Server functions

- `trg_partner_status_dar` — trigger on `partners.status` / `attendance` / `assignments.status` → calls `dar_trigger_recovery(partner_id, reason)`.
- `dar_trigger_recovery(p_partner_id, p_reason)` — selects today's pending Daily Shine `services` for that partner, marks `status='released'` + `original_partner_id`, inserts `dar_events`, calls `dar_find_candidates`.
- `dar_find_candidates(event_id)` — uses `get_coverage_at` + existing marketplace scoring (`weight_distance`, `weight_reliability`, `weight_capacity`, `weight_route_impact`, `weight_urgency`) filtered by DAR settings (`dar_min_remaining_capacity`, `dar_search_radius_km`, `dar_max_travel_increase_pct`). Inserts top-N `dar_offers`.
- `dar_accept_offer(offer_id, service_ids[])` — assigns selected services to the partner, calls existing route optimizer (cluster-first, respects locked/exact/emergency), updates `dar_events`.
- `dar_ignore_offer(offer_id)`, `dar_expire_offers()` (cron).
- `dar_dashboard_metrics()` — 8 metrics for admin.

### 2.3 Partner UI

- New card in `app.live.tsx` / `app.assignments.tsx`: **"Extra Customers Available"** when an active `dar_offers` row exists.
- Shows: count, +₹ monthly, +km, +min, service windows.
- Buttons: Accept All / Accept Selected (checkbox list) / Ignore.
- Realtime via `dar_offers` channel.

### 2.4 Admin Dashboard

- New route `/admin/dar` with 8 metric cards and live tables (Released, Pending, Recovered).
- Realtime via `dar_events` + `dar_offers` channels.
- Sidebar link "Recovery (DAR)" under Operations.

### 2.5 Customer experience

- No new customer notifications. Whitelist trigger already blocks ETA/route. Service window unchanged. Verified via existing `trg_block_forbidden_customer_notifications`.

### 2.6 Settings wired (all 11 DAR keys, already seeded)

| Key | Effect |
|---|---|
| `dar_enabled` | Master switch in `dar_trigger_recovery` |
| `dar_min_remaining_capacity` | Filter in `dar_find_candidates` |
| `dar_max_extra_cars` | Cap per offer |
| `dar_search_radius_km` | Initial radius |
| `dar_max_travel_increase_pct` | Route-impact filter |
| `dar_min_extra_earnings` | Offer floor |
| `dar_retry_count` | Re-fan-out retries |
| `dar_offer_timeout_sec` | `expires_at` calc + cron |
| `dar_emergency_mode` | Skip earnings floor when true |
| `dar_auto_optimize` | If false, partner manually reorders |

### 2.7 End-to-end verification (Playwright, no inspection-only PASS)

Script `/tmp/browser/dar/e2e.py`:
1. Seed: partner A with 3 daily-shine stops today; partner B nearby with capacity.
2. Sign in admin → mark partner A `unavailable`.
3. Poll `dar_events` until status=`offered`.
4. Sign in partner B → screenshot offer card → click Accept All.
5. Verify `services.partner_id` updated, route reoptimized (no zig-zag — assert sequence_no monotonic by cluster).
6. Sign in customer of one released service → verify booking page shows window only, no "reassigned" text, no ETA.
7. Open `/admin/dar` → verify metrics incremented in realtime.
8. Output PASS/FAIL table with screenshot paths.

Deliverable: `/mnt/documents/UrbanWash_DAR_E2E_Report.md`.

---

## Order of execution

1. Phase 1.5 migration + UI prune + verification.
2. DAR schema migration.
3. DAR RPCs + triggers migration.
4. Partner UI + Admin dashboard.
5. E2E Playwright run + report.

Stop and report after Phase 1.5 verification before starting DAR migrations? **No** — proceed continuously per the user's request, but produce one combined final report at the end.
