
# Customer Experience Redesign — "My Plan tells me exactly what I have left"

Sequenced in phases so we can ship value fast and iterate. Each phase is independently useful.

---

## Phase 1 — Home page polish (UI only)

**Vehicle card**
- Replace silhouette with actual vehicle photo (fall back to catalog image, then avatar).
- Show: photo, `Honda City`, `UP32AB1234`, `Sedan`.
- Two inline actions below the card: `Edit Vehicle`, `Change Photo`.

**Daily Shine card — "Includes" checklist**
- Replace description prose with a checklist:
  - Daily Exterior Cleaning
  - 1 Interior & Exterior Wash every month
  - Doorstep Service
  - Monday Weekly Rest

No backend changes. Files: `src/routes/c/_authed/home.tsx`.

---

## Phase 2 — My Plan redesign (UI + light backend)

**Active Plan card (top)**
```
Daily Shine Basic
₹1199 / month
Renews 1 August
Vehicle: Honda City
Status: Active

[ Modify Plan ]   [ Pause ]   [ Cancel ]
```
Cancel is visible, not hidden.

**Simplified Monthly Service Balance**
Collapse the 7-benefit grid into 4 customer-facing lines:
```
Daily Exterior       26 / 26
Included Wash         1 / 1
Extra Exterior        2 / 2   (only if add-on active)
Extra Interior        1 / 1   (only if add-on active)
```
Derived from existing `subscription_entitlements` rows — no schema change needed, just a mapping layer in the UI.

**Remove** the raw list of Hydrophobic / Paper Mats / Fragrance / Tyre Polish from the customer view (they still exist for partners/ops).

---

## Phase 3 — New Book-a-Wash flow (gated)

Replace current 4-tile picker (`Exterior / Interior / Dusting / Custom`) with a single flow:

```
[ Book a Wash ]
   ↓
Choose Service:
  ○ Included Monthly Wash    (1 remaining)
  ○ Extra Exterior Wash      (2 remaining)
  ○ Extra Interior Wash      (1 remaining)
  ○ Buy More Washes  →
   ↓
Calendar → Confirm → Booked
```

**Automatic validation**
- Options with 0 remaining don't render — they're replaced with a single "Buy More Washes" CTA.
- Tapping an exhausted option is impossible (no calendar opens, no error dialog needed).
- Wallet/credits are invisible to the customer; the app enforces silently.

---

## Phase 4 — Add-ons split into two sections

**Monthly Add-ons** (recurring, added to next billing cycle until removed)
- Extra Exterior Wash — ₹149 / month
- Extra Interior Wash — ₹199 / month
- Extra Interior & Exterior Wash — ₹299 / month

Copy under section: *"Added every month until you remove it."*

**One-time Add-ons** (this month only)
- Body Polish — ₹499
- Roof Cleaning — ₹499
- Seat Shampoo — ₹499

Requires new table `subscription_monthly_addons` (subscription_id, addon_type, price, active, added_at, removed_at) and a monthly cron that materialises them into `subscription_entitlements` at renewal.

---

## Phase 5 — Package Builder + Saved Packages

**Build My Plan**
```
Daily Shine Basic       ₹1199
+ 2 Extra Exterior      ₹298
+ 1 Extra Interior      ₹199
─────────────────────────────
Total                   ₹1696 / month

[ Save Package ]   [ Subscribe ]
```
Live price recompute; slider/stepper per add-on.

**Saved Packages** (per customer)
- `Family Car`, `Office Car`, `Weekend Package`
- When adding a new vehicle: `Apply Existing Package → ✓ Family Car`

Requires table `customer_saved_packages` (customer_id, name, base_plan_slug, addons jsonb).

---

## Phase 6 — Cancellation flow (end-of-period)

`Cancel Subscription` under Modify Plan opens a dialog:
```
Your plan will end on 31 July.
Current month remains active.
No more renewals after that.

[ Keep Plan ]   [ Confirm Cancel ]
```

Backend:
- Add `cancel_at_period_end boolean` + `cancelled_at timestamptz` to `subscriptions`.
- Existing renewal cron skips subscriptions where `cancel_at_period_end = true AND cycle_end <= now()`.
- Show a banner on My Plan: *"Ending on 31 July — [Undo]"* until end date.

Vehicle photo requirement: **not** included (per your answer).

---

## Technical section

**New tables / columns**
- `subscriptions`: add `cancel_at_period_end bool default false`, `cancelled_at timestamptz`.
- `subscription_monthly_addons` — recurring add-ons attached to a subscription.
- `customer_saved_packages` — reusable package templates per customer.

**New server functions** (`createServerFn`, RLS via `requireSupabaseAuth`)
- `bookAvailableWash(vehicleId, benefitType, slotDate)` — validates entitlement server-side before creating booking.
- `listBookableOptions(vehicleId)` — returns only options with remaining > 0, plus buy-more CTAs.
- `addMonthlyAddon(subscriptionId, addonType)` / `removeMonthlyAddon(...)`.
- `saveCustomerPackage(name, basePlan, addons)` / `applyPackageToVehicle(...)`.
- `requestCancellation(subscriptionId)` / `undoCancellation(subscriptionId)`.

**Renewal cron update**
- On cycle rollover, replay active monthly add-ons into `subscription_entitlements` for the new cycle.
- Honour `cancel_at_period_end`.

**Component changes**
- `src/routes/c/_authed/home.tsx` — vehicle card + inclusions checklist.
- `src/routes/c/_authed/subscriptions.tsx` (My Plan) — new active card, simplified balance, book flow, add-on sections, package builder entry, cancellation.
- `src/components/customer/PlanBalanceCard.tsx` — collapse to 4-line customer view.
- New: `BookAWashSheet.tsx`, `MonthlyAddonsSection.tsx`, `PackageBuilderSheet.tsx`, `SavedPackagesCard.tsx`, `CancelPlanDialog.tsx`.

---

## Rollout order

1. Phase 1 (Home visuals) — same turn.
2. Phase 2 (My Plan visuals + simplified balance) — same turn.
3. Phase 3 (Book-a-Wash gated flow) — next turn.
4. Phase 6 (Cancellation) — next turn (small, high-value).
5. Phase 4 (Monthly add-ons — needs migration + cron).
6. Phase 5 (Package builder + saved packages — needs migration).

I'll start with **Phase 1 + 2 + 6** in the first implementation turn (all UI + one small migration for cancellation), then move to gated booking, then add-ons & package builder.

Approve to begin.
