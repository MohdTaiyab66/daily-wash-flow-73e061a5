# Per-Vehicle Subscription Entitlements

Today the system charges every add-on flat rate and has **zero entitlement tracking** — there is no table that says "Vehicle A has 1 Interior left". This plan builds that end-to-end so included benefits are consumed before any payment is requested, scoped strictly per vehicle.

## 1. Data model (new)

`subscription_entitlements` (one row per vehicle × benefit type):
- `subscription_id` (FK, unique per benefit_type)
- `vehicle_id`, `user_id`, `plan_slug`
- `benefit_type` enum: `interior`, `exterior_daily`, `exterior_hydrophobic`, `dusting`, `tyre_polish`, `paper_mats`, `fragrance`
- `total_allocated int`, `consumed int default 0`
- `cycle_start date`, `cycle_end date` (monthly renewal window)
- Unique index: `(subscription_id, benefit_type, cycle_start)`

`entitlement_ledger` (audit; append-only):
- `entitlement_id`, `booking_id`, `addon_request_id`, `service_id`
- `delta int` (usually −1), `reason` text, `actor_user_id`, `created_at`

Plan → allocation map seeded in migration for `daily-shine`:
`interior=1, exterior_daily=26, exterior_hydrophobic=1, dusting=∞ (nullable=unlimited), tyre_polish=1, paper_mats=1, fragrance=1`.

**Trigger** on `subscriptions` INSERT / status→active: create/refresh entitlement rows for that vehicle for the current cycle. Renewal date roll creates the next cycle's rows.

## 2. RPCs (SECURITY DEFINER)

- `get_vehicle_entitlements(p_vehicle_id uuid)` → returns remaining balances the customer UI reads.
- `try_consume_entitlement(p_vehicle_id, p_benefit_type, p_booking_id, p_addon_request_id)` → atomic: locks the row, checks `consumed < total_allocated` (or unlimited), increments, writes ledger, returns `{consumed: true}` or `{consumed: false, reason}`.
- `service_slug_to_benefit(slug)` mapping helper.

All queries and RPCs scope by `vehicle_id` / `subscription_id`. Never `customer_id` for balances.

## 3. Booking flow rewrite

`confirm_customer_booking` (server RPC) becomes:

```text
find active subscription for p_vehicle_id  (NOT customer_id)
if subscription exists AND service maps to a benefit_type:
    try_consume_entitlement(...)
    if consumed: booking.amount=0, booking.paid_via='entitlement', skip Razorpay, notify admin+partner
    else: fall through to paid add-on flow
else:
    paid add-on flow (existing)
```

Client (`service.$slug.tsx`, `subscriptions.tsx` add-on dialog):
- Before render, fetch `get_vehicle_entitlements(vehicleId)`.
- If remaining > 0 for the requested benefit: show "₹0 — included in your Daily Shine plan", hide Razorpay button, single **Confirm** action.
- If remaining == 0: show "You've used all included Interior Washes" banner + paid add-on card with correct hatch/SUV price and **Continue** → Razorpay.

## 4. Admin & partner

- Admin booking notification payload already includes `vehicle_id`; extend to include the benefit consumed and remaining balances for that vehicle.
- Admin customer detail (`admin.customers.$id.tsx`) adds a per-vehicle "Plan balance" card (Interior 0/1, Exterior 12/26, Dusting ∞, etc.).
- Vehicle-audit page (already built) gets a new "Entitlement" column showing which benefit was consumed.
- Partner assignment payload is already vehicle-scoped; verify addon_request path also carries only the booked vehicle.

## 5. Notifications

Trigger on `try_consume_entitlement` when `consumed == total_allocated`: enqueue customer notification "You've used all included {Benefit} Washes in your Daily Shine plan." Uses existing `customer_notifications` table.

## 6. Vehicle-scoped query audit

Grep + fix every read that lists bookings/subscriptions/services by `customer_id` where a `vehicle_id` filter is needed for display:
- Admin customer detail
- Admin route manager
- Partner "My assignment"
- Customer "My Plan"

Verified list emitted after implementation.

## 7. Playwright regression (`scripts/test-entitlements.mjs`)

Extends existing multi-car test:
1. Create customer with Vehicle A (Daily Shine), Vehicle B (Daily Shine), Vehicle C (none).
2. Book Interior for A → assert ₹0, entitlement A.interior → 0/1, B.interior still 1/1.
3. Book Interior for A again → assert paid add-on shown, Razorpay invoked.
4. Book Interior for B → assert ₹0, B.interior → 0/1.
5. Book anything for C → assert paid.
6. Assert admin sees Vehicle A on step 2, Vehicle B on step 4 (no bleed).

## Technical notes

- Race safety: `try_consume_entitlement` uses `SELECT ... FOR UPDATE` inside the RPC so concurrent bookings can't double-spend the last credit.
- Cycle rollover: nightly cron already exists (`renewals`); extend to insert next-cycle entitlement rows when a subscription rolls.
- Dusting is unlimited in the plan; represent as `total_allocated = NULL` and treat `NULL` as "always consumable".
- Migration order: (a) create tables/enum, (b) backfill entitlements for existing active subscriptions from `plan_inclusions`, (c) grants + RLS (customer read own, admin all, service_role all; no anon), (d) install trigger + RPCs, (e) alter `confirm_customer_booking`.

## Files

**Create**
- `supabase/migrations/2026070517xxxx_entitlements.sql`
- `scripts/test-entitlements.mjs`
- `src/components/customer/PlanBalanceCard.tsx`
- `src/lib/entitlements.ts` (client helpers + benefit slug map)

**Modify**
- `src/routes/c/_authed/service.$slug.tsx` — entitlement check + zero-price flow
- `src/routes/c/_authed/subscriptions.tsx` — add-on dialog uses entitlement first
- `src/routes/c/_authed/home.tsx` — show balances per vehicle
- `src/routes/admin.customers.$id.tsx` — per-vehicle balance card
- `src/routes/admin.vehicle-audit.tsx` — entitlement column
- `src/integrations/supabase/types.ts` — regenerated after migration
