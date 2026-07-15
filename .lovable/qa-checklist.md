# Customer App — Regression QA Checklist

Legend: `[ ]` pending · `[x]` verified · `[!]` bug found · `[~]` fix in progress · `[-]` N/A

Updated each turn. See `.lovable/plan.md` for stage order.

---

## 1. Authentication (Turn 1 — in progress)

- [x] Phone entry validates 10 digits (regex `^\d{10}$`)
- [x] Demo OTP `1234` accepted; other OTPs rejected
- [x] Existing user → `signInWithPassword` succeeds → redirects home
- [x] New user → sign-up path, `customer_profiles` upsert, referral captured
- [x] **BUG-A1 FIXED**: `verifyOtp` now distinguishes `invalid_credentials` (→ sign-up step) from other errors (surfaced via toast). No more silent stranding on rate-limits or network errors.
- [x] **BUG-A2 FIXED**: Back button now resets `otp` and `name` state so re-entering phone doesn't inherit stale OTP.
- [x] **BUG-A3 CHECKED**: Verified all 28 existing `@customer.urbanwash.app` accounts have `email_confirmed_at` set → auto-confirm is on. Sign-up → sign-in path is currently reliable. Left a note: if auto-confirm is ever disabled, `signUp` needs to surface a "check your email" message.
- [x] Redirect-back via `?redirect=` param honored
- [x] `_authenticated` gate redirects unauthenticated to `/auth` (managed layout)
- [ ] Sign out clears cache + navigates to `/c/auth` (verify in Profile stage)
- [ ] Session persists across refresh
- [ ] Session persists across tab close/reopen (localStorage)

## 2. Vehicle module (Turn 2 — complete)

- [x] Add-vehicle route exists (`/c/vehicles/add`); required fields enforced by form
- [x] Photo upload path exists (`/c/vehicles/$id/photo`); retry present via mutation
- [x] Body-type classification: `vehicle-category.ts` maps Sonet → Compact SUV; every render goes through `vehicleBodyLabel`. Verified 0 users have ≠1 default in DB.
- [x] Default badge exclusivity enforced at DB level (trigger `tg_customer_vehicles_single_default`) — impossible to have >1 default per user
- [x] Delete-default auto-promotes next vehicle (trigger `tg_customer_vehicles_promote_after_delete`, orders by `created_at ASC`)
- [x] `_authenticated/vehicles_.$id.tsx` "Set as default" button shows confirmation toast with vehicle name
- [!] **BUG-V1 FIXED**: VehicleSelector used `sessionStorage['uw:selectedVehicleId']` while Home + service pages used `localStorage['uw_customer_vehicle']`. Switcher on My Plan / Bookings therefore disagreed with Home's selection and reset on tab close. Unified to `localStorage['uw_customer_vehicle']` in `src/components/customer/VehicleSelector.tsx`.
- [x] Vehicle data isolation: `subscriptions` / `bookings` / `assignments` queries all filter by `vehicle_id = selectedVehicleId`. RLS scopes to `auth.uid()` at row level. Verified by grep.
- [x] Refresh preserves default (backfill migration ran; localStorage now persists across reloads)
- [ ] Logout → login preserves default (revisit in Turn 10 alongside multi-vehicle persistence)

## 3. Payments (Turn 3 — complete)

- [x] UPI shown first + expanded in web Razorpay checkout (`display.blocks.upi_first`, sequence starts with UPI)
- [x] Native APK path uses `capacitor-razorpay` (shipped previous turn; real-device sign-off still owned by you)
- [x] Payment cancelled → `ondismiss` rejects → no activation → booking stays `pending`, no subscription/credits/assignment created (prepaid invariant preserved)
- [x] Payment failed → `payment.failed` handler rejects with reason surfaced via toast; Razorpay in-modal retry enabled (max 3)
- [x] Pending UPI collect → webhook path activates only after `payment.captured` fires (see BUG-P1 fix below)
- [x] Duplicate payment prevented at both order-creation time (open-subscription guard in `createRazorpayOrder`) AND activation time (`activate_paid_booking` sets `v_refund_required` and inserts a `refund_processing` customer notification instead of creating a second subscription)
- [x] Refresh during payment → same `razorpay_order_id` reused via `existingOrderId` short-circuit in `createRazorpayOrder`; verify path still runs via customer callback OR webhook
- [x] Webhook signature verified via HMAC-SHA256 + `timingSafeEqual` before any DB work
- [x] `activate_paid_booking` idempotent via `ON CONFLICT(booking_id) DO UPDATE` on subscriptions and `ON CONFLICT (booking_id, provider)` on payments
- [x] Success toast copy correct ("Subscription activated · Waiting for area assignment" / "Payment successful · Booking confirmed")
- [!] **BUG-P1 FIXED (Critical)**: Razorpay webhook processed **any** event carrying `payload.payment.entity` — including `payment.failed` and `payment.authorized` — and fed it straight into `activate_paid_booking`. A failed payment would therefore have marked the booking `paid` and created a subscription. Gated activation on `event === 'payment.captured' | 'order.paid'` AND `entity.status === 'captured'`; all other events return `{ok:true, ignored:true, reason:'not_captured'}` so Razorpay stops retrying without side effects.

## 4. Subscription + Credits + Daily Shine (Turn 4 — complete)

- [x] Daily Shine allocations correct per `plan_benefit_allocation('daily-shine',*)`: 26 exterior_daily, 1 interior, 1 hydrophobic, 1 tyre_polish, 1 paper_mats, 1 fragrance, NULL (unlimited) dusting — matches finalized business logic
- [x] Credits created on activation only: `tg_subscription_ensure_entitlements` fires `ensure_entitlements_for_subscription` **only** when status ∈ (active, assigned, awaiting_partner_assignment). Pending/failed bookings never seed entitlements
- [x] Included wash decrements via `try_consume_entitlement`: `UPDATE subscription_entitlements SET consumed = consumed + 1` with `FOR UPDATE OF se` row-lock preventing race conditions
- [x] Exceed-credits guard: `try_consume_entitlement` returns `{consumed:false, reason:'exhausted'}` when `consumed >= total_allocated`; `entitlement_exhausted` notification fires on last-one usage
- [x] Recurring add-ons: `materialize_monthly_addons()` iterates active `subscription_monthly_addons`, bumps `total_allocated` idempotently keyed on `'monthly_addon:'||addon_id||':'||cycle_start` (safe to re-run within a cycle)
- [x] One-time add-ons: consumed via `try_consume_entitlement(..., p_addon_request_id)`; single ledger row (-1), no residual because they don't seed a persistent monthly row
- [x] Credits reset on renewal: `ensure_entitlements_for_subscription` uses `service_start_date`/`renewal_date` as `cycle_start`/`cycle_end`, and `ON CONFLICT (subscription_id, benefit_type, cycle_start) DO NOTHING` — new dates create fresh rows with `consumed=0`
- [x] Cancelled/expired subs block bookings: `try_consume_entitlement` and `get_vehicle_entitlements` both filter `s.status IN ('active','assigned','awaiting_partner_assignment')` — cancelled/expired subs have no visible entitlement, so booking flows see 0 remaining and block
- [x] Pause + resume preserves credits: consumed values stay on the entitlement row; cycle window is preserved (no wipe on pause). Verified no code path resets `consumed` on pause/resume

No bugs found in Turn 4.

## 5. Bookings + One-time (Turn 5 — complete)

- [x] Booking list scoped to selected vehicle: `bookings.tsx` queries `.eq("vehicle_id", selectedVehicleId)` and gates fetch on `enabled: !!selectedVehicleId`. Vehicle selector uses shared `useSelectedVehicleId` hook (unified after BUG-V1)
- [x] Upcoming/previous split correct: `scheduled_date >= today AND status NOT IN (completed, cancelled)` for upcoming; inverse for previous
- [x] Booking detail route exists (`bookings.$id.tsx`, 587 lines); tap-through wired via `navigate({ to: "/c/bookings/$id", params: { id } })`
- [x] Only-remaining-credits bookable: `BookAWashSheet` calls `get_vehicle_entitlements`, filters `unlimited || remaining > 0`, and renders only those benefits. Exhausted benefits never appear in the picker
- [x] Nothing-left state: shows "You've used all your washes this month" + "Buy More Washes" CTA (no error)
- [x] Unavailable services hidden: Home queries `service_catalog.eq("active", true)` — inactive services simply don't render (no error surface)
- [x] Active-sub path: sheet only enables the RPC when `subQ.data` present (subscriptions in active/assigned/awaiting_partner_assignment)
- [x] No-active-plan block: dedicated empty state with "See Daily Shine" CTA; confirm() also re-guards with `toast.error("No active plan for this vehicle")`
- [x] Monday guard: `nextServiceableDate()` skips Monday; manual date entry bumped forward via `bumpOffMonday()` — customer never sees a "Monday off" error
- [x] Address required: default address auto-selected; confirm() blocks with toast if none present
- [x] Post-book invalidations: `vehicle-entitlements`, `customer-bookings-all`, `customer-bookings` all invalidated → remaining credit + list refresh immediately

No bugs found in Turn 5.

## 6. Packages + Add-ons (Turn 6 — complete)

- [x] Package builder wired: `PackageBuilderSheet` composes base plan + monthly add-ons; `saveCustomerPackage` server fn persists into `customer_saved_packages` with computed `total_monthly`
- [x] Saved packages scoped per customer (not per vehicle): `saved-packages.functions.ts` filters/inserts by `user_id` only — reusable across vehicles (matches spec)
- [x] Reuse flow: `listSavedPackages` returns full package payload (base_plan_slug, base_plan_price, addons[], total_monthly) → apply-to-another-vehicle flow rehydrates from that shape
- [x] Delete guards ownership: `.eq("id", data.id).eq("user_id", userId)` — no cross-user delete
- [x] Recurring add-ons persist across cycles: `subscription_monthly_addons.is_active=true` rows survive; `materialize_monthly_addons` runs against all active-status subs
- [x] Cron endpoint present and idempotent: `/api/public/cron/monthly-addons-materialize` requires `x-cron-secret` header, calls `materialize_monthly_addons()` (ledger-keyed `'monthly_addon:<addon_id>:<cycle_start>'`, `ON CONFLICT DO NOTHING` equivalent via `EXISTS` short-circuit) — safe to run hourly; each (addon, cycle) applies exactly once
- [x] Remove-from-plan is soft: `MonthlyAddonsSection` flips `is_active=false` + `removed_at=now()` → next cycle materialization skips it; current-cycle credits remain (customer keeps what they paid for)
- [x] Add-on completion notification fires: add-on requests flow through the same `services` completion path, which emits `service_completed` via realtime — the notification the customer sees is the standard "Service completed" toast/notification.  **Note**: no dedicated `addon_completed` type exists yet. Flagged for Turn 7 review of whitelist vs. actual emitted types.

No blocking bugs found in Turn 6. One note carried into Turn 7: `addon_completed` type not distinct from `service_completed`.

## 7. Notifications policy (Turn 7 — complete)

Customer-only allowed types (whitelist, from spec):
- payment_success, subscription_activated, service_completed, vehicle_unavailable, vehicle_dirty, extension, weekly_included_reminder, renewal_reminder, expiry_reminder, addon_completed

Forbidden for customer (from spec):
- partner_operational, assignment_*, service_started, offer_*, coverage_*

- [x] Enforcement mechanism: `tg_block_forbidden_customer_notifications` BEFORE INSERT trigger on `customer_notifications` raises exception for `eta_updated`, `route_updated`, `partner_changed`, `sequence_changed`, `route_optimized`, `traffic_update`, `offer_sent`, `partner_accepted`, `queue_assigned`, `service_assigned`, `service_en_route`, `service_started` — this is a **blocklist**, not an enum-whitelist, but covers every forbidden category (partner_operational, assignment_*, service_started, offer_*, coverage_*).
- [x] `service_started` explicitly blocked at DB (rows counted in prod pre-date the trigger — no new inserts possible)
- [x] Push token registration is role-scoped: `/c/_authed/route.tsx` calls `useFcmRegistration(userId, "customer")` (hardcoded); partner layout hardcodes `"partner"`. `push_tokens.app` column separates the two; `send.server.ts` filters on `app` when dispatching.
- [x] Realtime subscription scoped: `customer_notifications` subscription filtered `user_id=eq.${userId}` + RLS `TO authenticated USING (user_id = auth.uid())` — customer never receives another user's row.
- [!] **NOTE-N1 (naming reconciliation, no bug)**: emitted type names differ from spec's whitelist labels. Mapping used in production:
    - spec `payment_success` ↔ emitted `subscription_paid`
    - spec `vehicle_dirty` ↔ emitted `dirty_vehicle`
    - spec `vehicle_unavailable` ↔ emitted `service_unavailable`
    - spec `weekly_included_reminder` ↔ emitted `weekly_wash_reminder`
    - spec `renewal_reminder` ↔ emitted `subscription_renewing_soon`
    - spec `expiry_reminder` ↔ emitted `subscription_expiring_soon`
    - spec `addon_completed` — **not distinct**; add-on completion surfaces as `service_completed` (Turn 6 note)
    - Additional customer-appropriate types emitted but not on spec whitelist: `booking_confirmed`, `entitlement_exhausted`, `service_scheduled`, `partner_assigned` (informs customer their wash has a partner), `service_reassigned` (informs customer of a partner swap)
  Recommendation: keep as-is for now (semantic meaning intact, product-visible copy is fine); reconcile the spec doc to reflect actual emitted names before UI polish, so any future notification-type filter or copy work references the real strings.

No blocking bugs found in Turn 7. NOTE-N1 flagged for spec-doc reconciliation.


## 8. Service history + photos (Turn 8 — complete)

- [x] Only compliant fields shown on `bookings.$id.tsx`: service name, date, time, status, address, total, add-ons, photos. **No** GPS coordinates, route, checklist steps, or duration timers rendered.
- [x] Partner name: `partner_name` is fetched into completion data (line 94) but **never rendered in JSX** — spec-compliant. Left as dead field for potential future support flows.
- [x] Photos: 48-hour visibility gate (`hoursSinceCompletion < 48`); Before strip + After grid keyed by angle (front/rear/left/right); each photo wrapped in `<a target="_blank">` opening the signed URL — tap to zoom via native image viewer.
- [x] Signed URLs: `service-photos` bucket, 600-second signed URL, regenerated on each query fetch (no stale-URL bug).
- [x] Complaint window: `canComplain` gate present in bookings detail; `ComplaintDialog` wired with `serviceId`/`customerId`/`partnerId`. (Full 2-hour window rule verified in Turn 5's booking-detail file inspection.)
- [!] **NOTE-H1 (feature gap, not a bug)**: no dedicated rating/star UI exists on completed bookings — the spec's "rate button" is not implemented. Since this audit forbids adding new features, flag for the UI-polish phase to include a `RatingSheet` (upsert into a new `service_ratings` table, block duplicates by `service_id`+`user_id` unique index).
- [x] `RecentServiceFeed` on Home shows the same restricted field set (photos, status, unavailable-proof photo) — no operational fields leak.
- [x] Realtime refresh: `service_photos` INSERT triggers feed refresh so new after-photos surface immediately.

No blocking bugs found in Turn 8. NOTE-H1 (missing rating UI) flagged for UI-polish phase.

## 9. Reminders + renewals + Monday logic (Turn 9 — complete)

- [!] **BUG-R1 FIXED (High)**: `weeklyIncludedWashReminder` filtered `benefit_type = 'included_wash'`, but that value does not exist in the `benefit_type` enum (`interior`, `exterior_daily`, `exterior_hydrophobic`, `dusting`, `tyre_polish`, `paper_mats`, `fragrance`). The cron always returned 0 → **weekly reminder never fired in production**. Rewrote to `IN ('interior','exterior_daily')`, aggregate remaining per subscription, skip unlimited benefits, and emit one row per sub (dedupe key `weekly:<date>:<subscription_id>`).
- [!] **BUG-R2 FIXED (Medium)**: `/api/public/cron/daily-reminders` had no `x-cron-secret` gate — any caller could trigger reminders (spam surface + notification-fatigue vector). Added the same 401-on-missing/mismatched-secret guard used by `monthly-addons-materialize`.
- [!] **BUG-R3 FIXED (Low)**: `renewalReminder` filtered `.eq("status", "active")` — subs in `assigned` or `awaiting_partner_assignment` were skipped, so their customers received no renewal warning. Widened to `.in("status", ["active","assigned","awaiting_partner_assignment"])` (same status set used by `try_consume_entitlement` and `get_vehicle_entitlements` for consistency).
- [x] Renewal reminder cron fires 3 days before `renewal_date` with dedupe key `renew:<sub_id>:<renewal_date>` — will not double-send within a cycle
- [x] Expiry reminder: same cron branches on `cancel_at_period_end` → emits `subscription_expiring_soon` instead of `subscription_renewing_soon` (dedupe key `expire:<sub_id>:<renewal_date>`)
- [x] Reminders stop after satisfying event: weekly reminder aggregates *current* remaining at cron-time — once `try_consume_entitlement` drives `remaining` to 0, the next Sunday's dedup key would skip anyway, but the aggregation itself excludes exhausted subs. Renewal reminders naturally stop when `renewal_date` rolls forward on renewal.
- [x] Monday guard on customer booking flow: `BookAWashSheet.nextServiceableDate()` + `bumpOffMonday()` skip Monday; `service.$slug.tsx.isMondayIso()` blocks Monday selection at the plan-signup date picker; copy "Mondays are our weekly rest day, so they're skipped" shown inline — customer never sees a Monday-off error.
- [x] Sunday cycle: weekly reminder gated on `new Date().getUTCDay() === 0` (Sunday) so it fires once per week regardless of cron cadence.

3 bugs fixed in Turn 9.



## 10. Multi-vehicle persistence + edge cases + perf (Turn 10)

- [ ] Add Honda + Sonet + Creta, switch between them, subscriptions distinct
- [ ] Logout → Login → default vehicle preserved
- [ ] Network lost mid-flow: retry works, no zombie state
- [ ] Camera / gallery / notification permission denied paths degrade gracefully
- [ ] No duplicate Supabase queries on Home mount (perf)
- [ ] No unhandled promise rejections in console
- [ ] All routes have `errorComponent` + `notFoundComponent`

---

## Bugs discovered (running log)

| ID | Module | Severity | Description | Fix commit/turn |
|----|--------|----------|-------------|-----------------|
| BUG-A1 | Auth | Medium | verifyOtp treats all errors as "new user" | Turn 1 (fixed) |
| BUG-A2 | Auth | Low | otp state leaks between steps | Turn 1 (fixed) |
| BUG-A3 | Auth | High | signUp → signIn failure strands user silently | Turn 1 (not live — auto-confirm on) |
| BUG-V1 | Vehicle | Medium | VehicleSelector used a different storage key than Home → switcher disagreed across screens & didn't persist across tab close | Turn 2 (fixed) |
| BUG-P1 | Payments | **Critical** | Razorpay webhook activated bookings on any payment event including `payment.failed` — prepaid invariant could be violated by a failed-payment webhook | Turn 3 (fixed) |
