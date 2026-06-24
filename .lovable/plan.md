# Daily Shine Auto-Assignment Marketplace

When a customer's Daily Shine (or Hybrid Daily Shine) payment succeeds, the customer enters an "Awaiting Partner Assignment" queue. The system offers the booking to partners in priority order with timers, expands the radius if no one accepts, and assigns the first acceptor — then optimizes their route.

## Scope

Subscription services with `service_catalog.kind IN ('daily_shine','hybrid_daily_shine')`. Single code path for both. One-shot bookings keep their existing flow.

## Data model (new)

**`subscription_assignment_queue`** — one row per pending subscription booking.
- `booking_id` (unique), `customer_id`, `area`, `lat`, `lng`, `service_required_before`, `vehicle_category`
- `status`: `awaiting | offered | accepted | broadcast_area | broadcast_city | assigned | failed`
- `assigned_partner_id`, `current_offer_partner_id`, `offer_expires_at`
- `radius_km` (starts 0 → 2 → 5 → 10 → 15), `attempts_log jsonb`
- `created_at`, `updated_at`

**`subscription_offers`** — audit + active offer rows.
- `queue_id`, `partner_id`, `offered_at`, `expires_at`, `response` (`pending|accepted|declined|timeout`), `responded_at`, `distance_m`, `projected_extra_earnings`

**`partners`** — add `max_daily_cars int default 25`, `accepting_new boolean default true`.

**`platform_settings`** keys: `auto_assign_enabled` (bool), `auto_assign_timeout_sec` (30/60/90), `auto_assign_radius_steps` (jsonb `[2,5,10,15]`), `auto_assign_max_per_partner` (int), `auto_assign_min_per_partner` (int).

All tables: GRANT to `authenticated` + `service_role`, RLS on, policies scoped via `has_role` / `auth.uid()`.

## Server logic

`src/lib/subscription-assignment.functions.ts` (createServerFn, server-only helpers in `.server.ts`):

- `enqueueSubscriptionBooking({ bookingId })` — called from existing payment-success path. Inserts queue row, calls `offerNextPartner`.
- `offerNextPartner({ queueId })` — picks best candidate (see ranking), inserts `subscription_offers`, sets `current_offer_partner_id` + `offer_expires_at = now + timeout`, sends `partner_notifications` row + realtime broadcast.
- `respondToOffer({ offerId, accept })` — partner action. On accept: transaction creates/extends today's `assignment` for that partner, inserts `services` rows for remaining days of subscription window, recomputes route via existing `route-optimize.ts`, marks queue `assigned`, notifies customer. On decline/timeout: `offerNextPartner` again.
- `expireStaleOffers()` — cron-style sweep called by a public `/api/public/cron/assignment-tick` route (signature-verified) every minute; promotes `awaiting → broadcast_area → broadcast_city` per radius steps.

Ranking (single SQL): partners with `accepting_new=true`, `status='active'`, `home_area = customer.area`, current day-load `< max_daily_cars`, ordered by:
1. min distance to any of partner's today services (haversine), else distance from `home_lat/lng`
2. higher `rating`
3. lower current day-load

For area broadcast: same query without `home_area` filter, with radius cap. For city broadcast: expand radius across `auto_assign_radius_steps`.

## Frontend

**Customer**
- `src/routes/c/_authed/subscriptions.tsx` — show "Awaiting Partner Assignment" badge with live status (realtime channel on `subscription_assignment_queue` filtered by user). On `assigned`, show partner name, rating, start date.
- Post-payment toast updated to "Subscription activated. Assigning partner for your area."

**Partner**
- `src/routes/_authenticated/app.assignments.tsx` — top card "New Daily Shine Customer Available" when an offer exists for them. Shows area, vehicle, projected extra ₹, distance from route (e.g. "150 m from your route"), Accept/Decline, live countdown to `offer_expires_at`. Realtime subscription on `subscription_offers` filtered by partner.
- Area broadcast: same card, no timer, "First to accept wins".
- `src/routes/_authenticated/app.profile.tsx` — add Max Daily Cars selector (15/20/25/30/35) and Accepting-new toggle.

**Admin**
- `src/routes/admin.settings.tsx` — add Auto-Assignment section (timeout, radius steps, min/max per partner, ON/OFF).
- `src/routes/admin.manual-assignment.tsx` — show queue rows + manual-override Assign button.

## Route optimization

On accept, run existing `route-optimize.ts` for partner+date and persist the new `sequence_no` on `services`. Insert the new customer at the best position, not appended.

## Realtime

`ALTER PUBLICATION supabase_realtime ADD TABLE subscription_assignment_queue, subscription_offers;` Customer, partner, admin all subscribe via `useEffect` channels (per cloud-realtime rules).

## Cron

Public route `src/routes/api/public/cron/assignment-tick.ts` — HMAC-verified, calls `expireStaleOffers()`. Configured via pg_cron to hit `project--{id}.lovable.app/api/public/cron/assignment-tick` every 60s.

## Files to add / edit

- Migration: tables, columns, settings, RLS, realtime publication
- `src/lib/subscription-assignment.functions.ts` (new)
- `src/lib/subscription-assignment.server.ts` (new — ranking SQL, route recompute)
- `src/routes/api/public/cron/assignment-tick.ts` (new)
- `src/routes/c/_authed/subscriptions.tsx` (edit)
- `src/routes/_authenticated/app.assignments.tsx` (edit — offer card)
- `src/routes/_authenticated/app.profile.tsx` (edit — capacity)
- `src/routes/admin.settings.tsx` (edit — auto-assign config)
- `src/routes/admin.manual-assignment.tsx` (edit — queue view)
- Hook payment-success path (existing booking confirmation) to call `enqueueSubscriptionBooking` when service kind is daily_shine / hybrid_daily_shine

## Open questions

1. **Trigger point**: Should enqueue happen on `payment_status='paid'` for the booking, or only after admin marks subscription active? I'll default to immediately on successful payment.
2. **Subscription window**: Use `customers.subscription_start..subscription_end` to materialize daily `services` rows, or just register the partner and let the existing daily cron generate services? Default: register partner on the queue row, then existing assignment flow picks up daily services.
3. **No partner found**: After city broadcast exhausts, mark `failed` and notify admin via `partner_notifications` to a synthetic admin channel? Default yes.

I'll assume the defaults above unless you say otherwise.
