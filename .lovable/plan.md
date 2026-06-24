
# Pre-Launch: Reliability, Retention & Marketplace Visibility

Four shippable upgrades to the Daily Shine system. Each is independently useful and gated behind admin/partner visibility.

---

## 1. Partner Reliability Engine

Make reliability a real, visible score driven by events.

**Schema (migration):**
- Add `reliability_score int default 100` and `reliability_events_count int default 0` to `partners`.
- New table `partner_reliability_events`:
  - `partner_id`, `event_type` (enum), `delta int`, `service_id?`, `assignment_id?`, `note text`, `created_at`.
- Event deltas:

  ```text
  assignment_accepted     +1
  service_completed       +2
  on_time_service         +1
  customer_complaint      -5
  missed_service          -8
  assignment_cancelled    -4
  repeated_unavailability -3
  ```

- Trigger `apply_reliability_event()` clamps score 0–100 on insert.
- Helper RPC `log_reliability_event(partner_id, event_type, ...)`.

**Auto-wiring (triggers):**
- On `subscription_offers.status` → `accepted` → log `assignment_accepted`.
- On `services.status` → `completed` → log `service_completed` (and `on_time_service` when completed before SLA window).
- On `services.status` → `missed` → log `missed_service`.
- On `complaints` insert → log `customer_complaint`.
- On `subscription_assignment_queue.status` → `cancelled_by_partner` → log `assignment_cancelled`.

**UI:**
- `app.profile.tsx` (partner): new "Reliability Score: NN/100" card with last 5 events.
- `admin.partners.tsx` + `admin.partner-assignment.$id.tsx`: show score column/badge.
- Existing `admin.reliability.tsx`: feed it from new table (replace any placeholders).

---

## 2. Assignment Acceptance Context (time-first framing)

Already showing ₹/day and ₹/month on the offer card. Add the time framing partners actually care about.

**Changes (no schema):**
- `DailyShineOfferCard.tsx`: prominent row "Monthly Route Increase: only +X mins" computed as `route_delta_seconds * 26 / 60` (≈ active days/month).
- Reorder card hierarchy: deadline → vehicle/area → **+X mins/month** → ₹/day + ₹/month → distance.
- Add a subtle "Recommended" badge when `score >= 0.75`.

---

## 3. Assignment Lock Period (customer retention)

Once a partner accepts, customer stays with them for a minimum window.

**Schema (migration):**
- Add to `subscription_assignment_queue`:
  - `locked_partner_id uuid`
  - `lock_until timestamptz`
- Add to `platform_settings`: `assignment_lock_days` (default 15).
- On offer accept trigger: set `locked_partner_id = partner_id`, `lock_until = now() + lock_days`.

**Enforcement:**
- New RPC `can_reassign_subscription(queue_id, actor_role)`:
  - Returns true if `actor_role = 'admin'`, partner cancels/removed, or `now() > lock_until`.
- `admin.manual-assignment.tsx` and partner-cancel server fn check this RPC; partner cancels are always allowed but trigger a `assignment_cancelled` reliability hit.

**UI:**
- Customer `AwaitingPartnerBanner` (assigned state): "Your partner is locked in until {date}".
- Admin assignment detail: "Locked with {partner} until {date} — override?" button.

---

## 4. Admin Daily Shine Marketplace Dashboard

New route `src/routes/admin.marketplace.tsx` (linked from `admin.tsx` nav).

**Tabs / status columns** (all driven by existing `subscription_assignment_queue` + `subscription_offers`):
- Awaiting Assignment (`queue.status = 'queued'`, no live offer)
- Offered (live `offers.status = 'pending'`)
- Accepted (`offers.status = 'accepted'`, recent)
- Timed Out (`offers.status = 'timed_out'`)
- Broadcasted (queue radius at max step)
- Assigned (`queue.status = 'assigned'`)

**Each row shows:** customer, vehicle, area, deadline, current radius, attempts, last offered partner, score, age. Click → existing `admin.partner-assignment.$id.tsx`.

Realtime: subscribe to both tables and invalidate the list.

---

## Technical Notes

- All score/lock logic in Postgres so it stays consistent across cron, RPC, and UI paths.
- Realtime: enable publication on `partner_reliability_events` and `subscription_offers` (offers already enabled — verify).
- No new analytics events; no removed components.
- Out of scope: gamified reliability tiers, partner-side lock-period UI beyond a small badge, customer-initiated reassignment.

---

## Files

**New:** `supabase/migrations/<ts>_reliability_and_lock.sql`, `src/routes/admin.marketplace.tsx`, `src/components/partner/ReliabilityCard.tsx`, `src/components/admin/MarketplaceTable.tsx`.

**Edited:** `DailyShineOfferCard.tsx`, `AwaitingPartnerBanner.tsx`, `admin.partners.tsx`, `admin.reliability.tsx`, `admin.manual-assignment.tsx`, `admin.partner-assignment.$id.tsx`, `app.profile.tsx`, `admin.tsx` (nav), `subscription-assignment.functions.ts` (lock check + reliability hooks on cancel).
