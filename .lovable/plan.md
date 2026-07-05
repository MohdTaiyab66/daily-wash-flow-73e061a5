# Daily Shine Marketplace V2 — Broadcast + Dynamic Incentive

Replace today's sequential single-partner offer (`dar_offers` one-at-a-time) with a broadcast marketplace: every eligible partner sees a lead at the same time, the first valid acceptance wins atomically, and unaccepted leads auto-escalate through configurable rounds with rising incentive and expanding radius.

## Scope
- Applies only to Daily Shine subscription leads. Premium/one-off services keep their existing flow.
- Existing sequential DAR tick/timeout crons will be retired for Daily Shine after cutover; kept only for premium.

## Data model (new migration)

New tables:
- `marketplace_broadcasts` — one row per lead: `subscription_id`, `booking_id`, `vehicle_id`, `service_area_id`, `customer_lat/lng`, `status` (`open|assigned|expired|admin_alert`), `current_round`, `current_incentive`, `current_radius_m`, `round_started_at`, `round_expires_at`, `winning_partner_id`, `assignment_id`.
- `marketplace_offers` — one row per (broadcast, partner, round): `partner_id`, `round`, `incentive`, `distance_from_route_m`, `route_impact_m`, `sent_at`, `viewed_at`, `response` (`pending|accepted|declined|superseded|expired`), `responded_at`.
- `marketplace_settings` (single-row config in `platform_settings` JSON or dedicated table): `base_incentive`, `round_increments[]`, `max_incentive`, `round_duration_sec`, `max_rounds`, `broadcast_enabled`, `expand_radius_enabled`, `radius_per_round_m[]`, `neighbour_polygon_expansion`, `auto_assign_final_round`.
- `marketplace_round_history` — audit of round transitions.

All tables: GRANT to `authenticated`/`service_role`, RLS, `updated_at` triggers.

## Core RPCs (SECURITY DEFINER)

- `mp_open_broadcast(p_subscription_id)` — called by `activate_paid_booking` after a Daily Shine subscription becomes active. Computes eligible partners in polygon (online, accepting, active assignment in area, capacity, not suspended, route not full), inserts `marketplace_broadcasts` + `marketplace_offers` rows for round 1, fires realtime.
- `mp_accept_offer(p_broadcast_id)` — atomic: `UPDATE marketplace_broadcasts SET status='assigned', winning_partner_id=auth.uid() WHERE id=... AND status='open'` with `RETURNING`. If 0 rows → race lost, return `{ ok:false, reason:'already_taken' }`. On win: create assignment, mark other offers `superseded`, subscription → `assigned`, insert `assignment_changes` audit row, return `{ ok:true, assignment_id }`.
- `mp_decline_offer(p_broadcast_id)` — marks partner's offer `declined`; if all pending in this round are non-pending → immediately trigger next round (short-circuits the timer).
- `mp_advance_round(p_broadcast_id)` — called by cron when round expires. Increments round + incentive + radius per settings, recomputes eligible partners (route-distance ranked when beyond initial polygon), inserts new offers. At `max_rounds`: if `auto_assign_final_round` on → pick top-ranked partner; else set `admin_alert` and insert `admin_alerts` row.
- `mp_eligible_partners(p_broadcast_id, p_radius_m, p_include_neighbours)` — helper returning ranked partner list (route distance, remaining capacity, today's load, acceptance rate).

## Cron / scheduler

Replace `dar-timeouts` for Daily Shine with `/api/public/cron/marketplace-tick` (every 15s):
- Selects broadcasts where `status='open' AND round_expires_at <= now()`.
- Calls `mp_advance_round` for each.
- Auth via `apikey` header (Supabase anon key), per convention.

Existing `dar-timeouts` continues to serve premium DAR only.

## Server functions / routes

- `src/lib/marketplace.functions.ts`:
  - `acceptMarketplaceOffer({ broadcastId })` — `requireSupabaseAuth`, wraps `mp_accept_offer`.
  - `declineMarketplaceOffer({ broadcastId })`.
  - `getPartnerOpenOffers()` — lists open broadcasts where this partner has a pending offer in the current round, with distance/route-impact/earning info.
- `src/lib/admin-marketplace.functions.ts` (admin-gated): CRUD on `marketplace_settings`, analytics reads.
- Wire `mp_open_broadcast` call into `activate_paid_booking` (or the post-payment assignment queue processor) — replace current `dar-offer` seeding for Daily Shine only.

## Frontend

**Partner app**
- New `src/components/partner/MarketplaceOfferCard.tsx` — shows customer, vehicle, distance-from-route, earning, working days, hours/day, route impact (`Adds only 350m` vs `Adds 2.3km`), estimated finish time, live countdown, Accept/Decline.
- `src/routes/_authenticated/app.index.tsx` and `app.notifications.tsx`: subscribe to realtime on `marketplace_offers` filtered by `partner_id=auth.uid()` and `marketplace_broadcasts` (status changes). On `status='assigned'` for a broadcast the partner didn't win → toast "Customer already accepted" and remove card.
- Retire the sequential `DarOfferCard` for Daily Shine leads (keep for premium).

**Admin**
- New `src/routes/admin.marketplace-settings.tsx` — form bound to `marketplace_settings`: base rate, per-round increments array, max incentive, round duration, max rounds, broadcast on/off, expand radius on/off, radius per round, neighbour polygon on/off, auto-assign toggle.
- Extend existing `src/routes/admin.marketplace.tsx` with analytics: broadcasts sent, accepted by round, expired, avg acceptance time, avg incentive, most active partners, conversion rate.
- Live view of open broadcasts with round/incentive/eligible-partner count.

**Customer**
- No new screen; existing awaiting-partner banner listens to subscription status → refreshes on `assigned`.

## Realtime

Enable realtime on `marketplace_broadcasts` and `marketplace_offers`. Partner app subscribes filtered by `partner_id`; admin dashboard subscribes to all; customer subscribes to their subscription row.

## Atomicity guarantees

- `mp_accept_offer` uses conditional `UPDATE ... WHERE status='open'` with `RETURNING` inside a transaction — Postgres row-lock guarantees exactly one winner even under concurrent accepts.
- Unique partial index: `CREATE UNIQUE INDEX ON marketplace_broadcasts(subscription_id) WHERE status IN ('open','assigned')` — prevents duplicate open broadcasts per subscription.
- Assignment insert guarded by the same subscription-uniqueness check already used in `activate_paid_booking`.

## Round-2+ ranking (route-aware)

`mp_eligible_partners` for round ≥ 2 ranks by:
1. Route insertion cost (m added to today's route) — computed via existing route helpers.
2. Remaining daily capacity.
3. Today's assignment count (ascending).
4. 30-day acceptance rate (descending).

Uses `coverage_zones` polygons + `ST_DWithin` on partner route line for radius expansion; `neighbour_polygon_expansion` union of touching polygons at the final round.

## Analytics queries

Materialised view or on-demand admin RPC `mp_analytics(range)` returning the metrics above from `marketplace_broadcasts` + `marketplace_offers` + `marketplace_round_history`.

## Migration plan

1. Migration: tables, indexes, RLS, GRANTs, settings seed (defaults: base 17, increments [1,2,2], max 22, 90s, 4 rounds, radii [in-polygon, 2km, 5km, neighbour]).
2. Migration: RPCs above.
3. Migration: enable realtime on new tables; wire `activate_paid_booking` → `mp_open_broadcast` for Daily Shine; leave premium untouched.
4. Cron route + `pg_cron` schedule (15s tick).
5. Server functions + admin server functions.
6. Partner UI: new offer card + list + realtime; retire Daily Shine path in old `DarOfferCard`.
7. Admin: settings screen + analytics extension.
8. Playwright regression `scripts/test-marketplace-v2.mjs`: broadcast to N partners, first-accept-wins race, round advancement with incentive/radius change, admin-alert at final round, premium leads bypass broadcast.

## Out of scope
- No changes to premium/one-off booking flow.
- No changes to entitlement / pricing engine.
- No changes to payments or Razorpay path.

Confirm to proceed and I'll implement in the order above.
