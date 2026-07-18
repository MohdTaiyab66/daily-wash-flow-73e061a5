# Daily Shine Pipeline — Phase 0 Inventory

Snapshot of every code path currently touching payment → assignment → notification. Produced against the live schema before any consolidation begins. Use this as the retirement checklist for Phase 2.

## Legend
- **Keep** — will remain (possibly rewritten under the orchestrator).
- **Retire** — replaced by orchestrator; drop in Phase 2.
- **Move** — logic folded into a new orchestrator function.

---

## 1. Triggers on pipeline tables (58 total)

### bookings (10)
| Trigger | Timing | Verdict | Replaced by |
|---|---|---|---|
| `block_monday_daily_shine` | BEFORE INSERT | Keep | business rule |
| `trg_bk_updated` | BEFORE UPDATE | Keep | timestamp util |
| `trg_booking_cancel_restores_daily_shine` | AFTER UPDATE | Move | orchestrator `cancel_paid_booking` |
| `trg_booking_completes_daily_shine` | AFTER UPDATE | Move | orchestrator `service_complete` |
| `trg_booking_covers_daily_shine` | AFTER INS/UPD | Move | orchestrator `activate_paid_booking` |
| `trg_bookings_admin_notify_on_paid` | AFTER INS/UPD | Retire | `emit_event('BOOKING_PAID')` → notify service |
| `trg_bookings_enforce_vehicle_owner` | BEFORE INS/UPD | Keep | integrity guard |
| `trg_bookings_enqueue_subscription` | AFTER INS/UPD | Retire | orchestrator called explicitly by webhook |
| `trg_sync_booking_gps_from_address` | BEFORE INS/UPD | Keep | data hygiene |

### subscriptions (7)
| Trigger | Verdict | Notes |
|---|---|---|
| `trg_mp_cancel_on_sub_cancel` | Move | into orchestrator `cancel_paid_booking` |
| `trg_mp_open_on_sub_active` | Retire | orchestrator calls `enqueue_assignment` directly; no implicit path |
| `trg_sub_ensure_ent` | Keep | entitlements |
| `trg_subscription_requires_paid_booking` | Keep | invariant guard |
| `trg_subscriptions_updated_at` | Keep | timestamp |

### subscription_assignment_queue (2)
| Trigger | Verdict |
|---|---|
| `trg_queue_requires_paid_booking` | Keep |
| `trg_queue_updated_at` | Keep |

### subscription_offers (7)
| Trigger | Verdict | Notes |
|---|---|---|
| `trg_archive_offer_notification` | Retire | notify service owns the notification lifecycle |
| `trg_log_offer_created` | Keep | audit |
| `trg_log_offer_response` | Keep | audit |
| `trg_offer_accepted_lock` | Retire | folded into atomic `partner_accept_offer` |
| `trg_offer_accepted_reliability` | Keep | scoring — orthogonal |
| `trg_offer_no_duplicate_pending` | Keep | invariant guard |
| `trg_offer_requires_paid_booking` | Keep | invariant guard |

### services (13)
| Trigger | Verdict | Notes |
|---|---|---|
| `credit_completed_service` | Keep | ledger — orthogonal |
| `trg_notify_customer_reassignment` | Retire | via notify service |
| `trg_notify_customer_service_status` | Retire | via notify service |
| `trg_notify_window_delay` | Retire | via notify service |
| `trg_service_status_reliability` | Keep | scoring |
| `trg_services_enforce_vehicle_owner` | Keep | integrity |
| `trg_services_integrity` | Keep | integrity |
| `trg_set_service_destination` | Keep | data hygiene |
| `trg_sync_booking_from_service_status` | Move | orchestrator `service_complete` owns this |
| `trg_sync_subscription_from_service` | Move | orchestrator owns this |
| `services_updated_at` | Keep | timestamp |

### marketplace_offers / marketplace_broadcasts / partner_notifications / customer_notifications
All keep-or-retire triggers already listed above; the two `require_paid` guards and the customer-notification allow-list stay as defense in depth.

### assignments (2)
| Trigger | Verdict |
|---|---|
| `trg_assignments_original_duration` | Keep |
| `trg_cleanup_services_on_assignment_change` | Keep |

---

## 2. RPCs referenced from code (call sites in `src/`)

| RPC | Referenced from | Verdict | Replacement |
|---|---|---|---|
| `respond_subscription_offer` | OfferPopup, MarketplaceOffersList, DailyShineOfferCard, `app.leads.$offerId` | Retire | `partner_accept_offer` / `partner_decline_offer` |
| `get_pending_offer_for_partner` | client hooks | Keep | server-authoritative, unchanged contract |
| `get_partner_open_offers` | `marketplace.functions.ts` | Keep | Phase 1 already made this authoritative |
| `mp_accept_offer` / `mp_decline_offer` | (legacy marketplace path) | Retire | fold into `partner_accept_offer` |
| `notify_partners_new_customer` | (unreferenced from client) | Retire | notify service |
| `offer_next_for_queue` | cron `assignment-tick` | Move | called only by orchestrator `enqueue_assignment` |
| `pick_next_partner_for_queue` | `offer_next_for_queue` | Keep | pure ranking helper |
| `pick_scored_partner_for_queue` | (unused) | Retire | dead code |
| `activate_paid_booking` | razorpay webhook | Keep | becomes orchestrator entry point |
| `enqueue_subscription_booking` | `activate_paid_booking` | Move | inlined into orchestrator |

---

## 3. Cron / hook routes (9 total)

| Route | Purpose | Verdict | Replacement |
|---|---|---|---|
| `cron/assignment-tick` | runs `offer_next_for_queue` per queue | Keep (rewritten) | drives orchestrator's `enqueue_assignment` retries only |
| `cron/marketplace-tick` | legacy marketplace sweep | Retire | orchestrator + server-authoritative offers |
| `cron/marketplace-push-dispatch` | FCM for marketplace | Retire | single notify service |
| `cron/offer-push-dispatch` | FCM for daily shine | Retire | single notify service |
| `hooks/notification-push` | generic notification fan-out | Retire | single notify service |
| `cron/daily-reminders` | customer reminders | Keep | orthogonal |
| `cron/dar-*` (2) | dispatch-at-risk sweep | Keep | orthogonal |
| `cron/monthly-addons-materialize` | addon rollover | Keep | orthogonal |

New route: **`cron/notify-tick`** — sole consumer of `pipeline_events`.

---

## 4. New schema (Phase 1)

```
pipeline_events(
  id uuid pk,
  event_type text,   -- BOOKING_PAID | SUBSCRIPTION_ACTIVATED |
                     -- SERVICE_GENERATED | OFFER_CREATED |
                     -- OFFER_ACCEPTED | ASSIGNMENT_CREATED |
                     -- SERVICE_COMPLETED
  booking_id uuid,   -- always populated for traceability
  row_id uuid,       -- primary entity for the event
  payload jsonb,
  emitted_by text,
  emitted_at timestamptz default now(),
  dispatched_at timestamptz null
)
```

RLS: `service_role` all; `authenticated` no access. Backs `v_pipeline_trace(booking_id)`.

---

## 5. Retirement summary

- **13 triggers dropped**, 6 moved into orchestrator functions, remainder kept.
- **6 RPCs dropped**, 3 moved/renamed.
- **5 routes deleted**, 1 route added (`notify-tick`).
- Net: ~30 fewer moving parts, one linear call graph.

## What I need from you to proceed

1. Confirm this inventory matches your understanding. Flag anything marked **Retire** that you actually still depend on.
2. Approve Phase 1 (create `pipeline_events`, orchestrator functions) — non-destructive; legacy paths still run.
3. Approve Phase 2 (destructive drops) — I will not execute this without a separate explicit yes.
4. Provide one recent `booking_id` for the Phase 7 evidence run.
