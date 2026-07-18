# Daily Shine Pipeline — Full Consolidation Plan

Goal: replace the accumulated web of triggers, RPCs, crons, and client fallbacks with **one** linear pipeline from payment to service completion. Every stage runs exactly once. Every responsibility has exactly one owner.

This is a multi-day rebuild, not a patch. I'll ship it in ordered phases so we can verify each layer before moving to the next.

---

## Phase 0 — Freeze & inventory (no code changes yet)

Before deleting anything, I catalog every code path currently touching Daily Shine so nothing gets orphaned mid-migration.

1. Enumerate all DB triggers on `bookings`, `payments`, `payment_transactions`, `subscriptions`, `subscription_assignment_queue`, `subscription_offers`, `assignments`, `services`, `partner_notifications`, `customer_notifications`, `admin_alerts`.
2. Enumerate every RPC referenced from server functions + cron routes.
3. Enumerate every cron job in `cron.job`.
4. Enumerate every `/api/public/cron/*` and `/api/public/hooks/*` route.
5. Produce `docs/daily-shine-inventory.md` — a single table of {path, role, keep/retire, replaced-by}.

Deliverable: the retirement list the rest of the phases execute against.

---

## Phase 1 — The orchestrator (single source of truth)

One SQL orchestrator module. Every function is `SECURITY DEFINER`, idempotent, and takes an explicit input row id (no implicit "find the latest").

```text
activate_paid_booking(booking_id)
  └─ create_today_service(subscription_id, date)
       └─ enqueue_assignment(service_id)
            └─ create_marketplace_offer(queue_id, partner_id)
                 └─ emit_event('NEW_DAILY_SHINE_OFFER', offer_id)

partner_accept_offer(offer_id, partner_id)   -- one transaction
  ├─ lock + verify pending
  ├─ mark offer accepted, supersede siblings
  ├─ upsert assignment
  ├─ attach today's service
  ├─ emit_event('ASSIGNMENT_CREATED', assignment_id)

service_complete(service_id)
  └─ emit_event('SERVICE_COMPLETED', service_id)
```

- `emit_event` writes to a new `pipeline_events` table (append-only). The notification service and any observers read from there. No function directly inserts into `partner_notifications` / `customer_notifications` / `admin_alerts` anymore.
- Every orchestrator function returns `(ok bool, stage text, row_id uuid, reason text)` for traceability.

## Phase 2 — Retire legacy paths

Drop in one migration, referencing the Phase 0 inventory:

- All `trg_notify_*`, `trg_bookings_*`, marketplace/offer/notification legacy triggers replaced by the orchestrator.
- Legacy RPCs: `offer_next_for_queue` (rewritten), `respond_subscription_offer` (rewritten as `partner_accept_offer` / `partner_decline_offer`), duplicate assignment-creation RPCs.
- Client-side "fallback" pipelines in server functions (e.g. loose `services` fetch in `use-today-assignment.ts` when no assignment exists) — Home renders **only** from `assignments`.

## Phase 3 — One notification service

New module `src/lib/notifications.server.ts` + one cron route `/api/public/cron/notify-tick`.

- Subscribes to `pipeline_events` where `dispatched_at IS NULL`.
- For each event type, one handler builds one FCM payload and writes one row into the appropriate `*_notifications` table with `pushed_at` set atomically via the same claim pattern already used in `offer-push-dispatch`.
- Owns: channel selection (`assignments_v3` vs `general`), `dataOnly`, tag, deep link, sound, vibration.
- Kotlin side untouched — `assignments_v3` + `uw_offer.mp3` + full-screen intent already in place.
- Delete `notification-push.ts`, `marketplace-push-dispatch.ts`, `offer-push-dispatch.ts` after cutover. One tick, one dispatcher.

## Phase 4 — Partner accept, atomic

Single RPC `partner_accept_offer(offer_id)` running inside one `BEGIN`:

1. `SELECT ... FOR UPDATE` on offer; abort if not pending or expired.
2. Update offer → `accepted`, supersede siblings for same queue.
3. Insert/upsert `assignments` row (idempotent on `(partner_id, customer_id, start_date)`).
4. Attach today's `services` row to the assignment.
5. Update `subscription_assignment_queue` → `assigned`.
6. `emit_event('ASSIGNMENT_CREATED', ...)` — notification service handles customer + admin messaging.

Any failure → full rollback. Client sees a typed error and retries.

## Phase 5 — Route rendering from assignments only

- `useTodayAssignment` reads exclusively from `assignments` + attached `services`. The "loose services when no assignment" branch is removed.
- Realtime subscription on `assignments` for the current partner invalidates the query. No polling races.
- Home + Live Route + My Assignment all consume the same hook.

## Phase 6 — SQL cleanup

- Fix `column c.distance_km does not exist` and any other runtime errors surfaced by log inspection.
- Add `supabase--linter` pass; every warning attributable to the new pipeline must be zero before shipping.

## Phase 7 — Evidence view

`public.v_pipeline_trace(booking_id)` returns one row per stage with:

| stage | timestamp | row_id | function | ok | reason |

Backed by `pipeline_events` + joined lookups. This is the artifact I'll paste per booking in the E2E validation.

## Phase 8 — Device verification runbook

`docs/daily-shine-device-verification.md` — the 5×N matrix (locked / screen off / killed / background / foreground × heads-up / ringtone / vibration / wake / deep link / accept / decline / assignment / route). You run it on physical hardware; I annotate with server-side evidence from `v_pipeline_trace`.

---

## Technical details

- **Storage**: new tables `pipeline_events` (append-only), `pipeline_event_dispatch` (claim log). Both RLS-locked to `service_role`.
- **Migration order**: (1) create new tables + orchestrator functions, (2) rewrite server-fn call sites to orchestrator, (3) drop legacy triggers/RPCs, (4) delete legacy routes. Each step is reversible via a follow-up migration.
- **No client-side business logic changes** beyond swapping the today-assignment hook to assignments-only and removing the temporary MarketplaceOfferSheet client filter.
- **Kotlin**: no changes. Existing `assignments_v3` channel + `uw_offer.mp3` + `postAssignment` full-screen path is already correct; the fix is upstream.
- **Cutover**: single deploy per phase, with the previous phase's paths still callable until the next phase's tests pass. Phase 2's DROPs are the point of no return.

## Out of scope for this plan

- UI polish, new features, admin dashboard redesign.
- Kotlin/native changes — none required.
- Marketplace pricing / partner ranking logic — left as-is; only the plumbing around it changes.

## What I need from you before I start

1. **Green light on Phase 0** (inventory only, no destructive changes) so I can produce the retirement list against your live schema.
2. Confirmation that I may **drop** legacy triggers/RPCs listed in the inventory in Phase 2 — this is irreversible without restore.
3. One recent `booking_id` you're willing to use as the Phase 7 evidence trace subject.

Once you approve, I start Phase 0 immediately and post the inventory before touching schema.
