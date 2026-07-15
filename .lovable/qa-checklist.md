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

## 3. Payments (Turn 3)

- [ ] UPI shown first in web Razorpay checkout
- [ ] Native APK uses `capacitor-razorpay` (real device only)
- [ ] Payment cancelled → no subscription, no credits, no booking, no assignment
- [ ] Payment failed → toast surfaces reason, retry works, no side effects
- [ ] Payment pending (timeout) → no activation until verified
- [ ] Duplicate payment prevented (idempotency by order_id)
- [ ] Refresh during payment → recovery via `verifyRazorpayPayment` or webhook
- [ ] Webhook signature verified before activation
- [ ] `activate_paid_booking` is idempotent
- [ ] Success toast copy matches business rule ("Subscription activated · Waiting for area assignment")

## 4. Subscription + Credits + Daily Shine (Turn 4)

- [ ] Daily Shine plan inclusions match: Daily Exterior + 1 Interior&Exterior/month
- [ ] Credits created on activation, not before
- [ ] Included wash decrements after use
- [ ] Customer cannot exceed credits
- [ ] Recurring add-ons increase credits monthly (materialize cron)
- [ ] One-time add-ons work once, no residual credit
- [ ] Credits reset correctly on renewal
- [ ] Cancelled subscription blocks new bookings
- [ ] Expired subscription blocks new bookings
- [ ] Pause + resume preserves remaining credits

## 5. Bookings + One-time (Turn 5)

- [ ] Booking list scoped to selected vehicle
- [ ] Booking detail loads without error
- [ ] Only services with remaining credits are bookable
- [ ] Unavailable services hidden (not error)
- [ ] Book-a-wash sheet from `/c/home` works with active sub
- [ ] Book-a-wash sheet gracefully blocked without active sub

## 6. Packages + Add-ons (Turn 6)

- [ ] Package builder: create → save → reuse → apply to another vehicle
- [ ] Recurring package renews on schedule
- [ ] Saved packages list correctly scoped per customer (not per vehicle)
- [ ] Monthly add-ons materialize on the 1st (cron `monthly-addons-materialize`)
- [ ] Add-on completion notifications fire

## 7. Notifications policy (Turn 7)

Customer-only allowed types (whitelist):
- payment_success, subscription_activated, service_completed, vehicle_unavailable,
  vehicle_dirty, extension, weekly_included_reminder, renewal_reminder,
  expiry_reminder, addon_completed

Forbidden for customer:
- partner_operational, assignment_*, service_started, offer_*, coverage_*

- [ ] `customer_notifications` schema constrains type to whitelist
- [ ] Push token registration path only fires for customer role on customer app
- [ ] No partner-operational rows leak into `customer_notifications` inserts
- [ ] Realtime subscription on Home only pulls customer notifications

## 8. Service history + photos (Turn 8)

- [ ] History shows date, time, status, photos, rate button ONLY
- [ ] No GPS / partner name / route / checklist / duration displayed
- [ ] Photo grid opens zoomable viewer
- [ ] Signed URLs expire and refresh
- [ ] Complaint window: 2 hours after completion
- [ ] Rating submission stores + prevents duplicate

## 9. Reminders + renewals + Monday logic (Turn 9)

- [ ] Weekly included-wash reminder cron fires
- [ ] Renewal reminder cron fires N days before expiry
- [ ] Expiry reminder cron fires day of / after
- [ ] Reminders stop after booking that satisfies the reminder
- [ ] Monday: weekly rest day handled — no errors, bookings shifted
- [ ] Sunday count / cycle rules honored

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
