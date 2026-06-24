# Daily Shine Marketplace — Round 2 Enhancements

Scope: improve partner acceptance UX, smarter ranking, customer trust signal, and run a true end-to-end verification of the flow. No new tables.

## 1. Richer Partner Offer Card

File: `src/components/partner/DailyShineOfferCard.tsx`

Show before Accept/Decline:
- 🚗 Vehicle: `make model` + category (from `customer_vehicles`)
- 📍 Area name (from customer address)
- ⏰ Service deadline window (e.g. "Before 8:00 AM" from `platform_settings.daily_shine_cutoff` or default)
- 📏 Distance from partner's current route in meters (already computed server-side; surface it)
- 💰 `+₹X/day` and `+₹X/month` projected extra earnings (already returned, relabel + show both)
- 🕒 Approx. minutes added to route — new field `route_delta_minutes` returned from offer

Server: extend `pick_next_partner_for_queue` / `offer_next_for_queue` RPCs and `subscription_offers` row payload with `route_delta_seconds`, `distance_from_route_m`, `extra_per_day_paise`, `extra_per_month_paise`, `vehicle_label`, `area_label`, `deadline_label`. Compute `route_delta_seconds` via a lightweight insertion heuristic in `src/lib/route-optimize.ts` (already exists) — wrap as `estimateInsertionCostSeconds(partnerId, newPoint)` and expose through a server function the RPC can call, OR compute in TS inside `offerNextPartner` server-fn (preferred — keep SQL simple).

Decision: move the ranking + enrichment from RPC into the existing `offerNextPartner` server function so we can use the TS route-optimizer. The RPC becomes a thin "list candidate partners in radius" query.

## 2. Smart Assignment Score

Currently: distance + area + capacity.
New ranking inside `offerNextPartner`:

```text
score =
   0.45 * (1 - route_delta_minutes / 20)      // route impact (clamped)
 + 0.20 * (1 - distance_km / radius_km)        // proximity
 + 0.15 * partner.rating / 5                   // reliability
 + 0.10 * (1 - current_load / max_daily_cars)  // capacity headroom
 + 0.10 * deadline_urgency                     // 1 if <2h to deadline, else 0.3
```

Sort candidates desc by score; offer to top one. Persist the score breakdown in `subscription_offers.score_breakdown` jsonb so admin can audit.

Migration: add nullable columns to `subscription_offers`:
- `route_delta_seconds int`
- `distance_from_route_m int`
- `extra_per_day_paise int`
- `extra_per_month_paise int`
- `score numeric`
- `score_breakdown jsonb`

(`vehicle_label`/`area_label`/`deadline_label` derived at render time from joins — no new columns.)

## 3. Customer Assignment Notification

On partner accept (`respondToOffer` accept branch):
- Insert a `customer_notifications` row OR (since table may not exist) reuse existing customer toast/banner pattern. Check: query `supabase-tables` shows no `customer_notifications` — use the existing `AwaitingPartnerBanner` realtime channel. When `subscription_assignment_queue.status = 'assigned'`, banner flips to a success card showing:
  - Partner name + photo
  - ⭐ rating
  - Assigned date (now)
  - Service start date (tomorrow or today if before cutoff)
- File: `src/components/customer/AwaitingPartnerBanner.tsx` — add `AssignedPartnerCard` sub-view rendered when status==='assigned', fetching partner via existing join.

No new notification table needed for v1; banner + realtime is sufficient. Push notification can be added later via existing `push_tokens`.

## 4. End-to-End Verification

Drive Playwright through the full flow against localhost:
1. Customer login → select vehicle → buy Daily Shine → mock Razorpay success
2. Verify `subscription_assignment_queue` row created (`status=awaiting`)
3. Verify `subscription_offers` row created with enriched fields populated
4. Login as partner → see offer card with all 7 info rows
5. Click Accept → verify:
   - `subscription_assignment_queue.status='assigned'`
   - `assignments` row exists/extended for today
   - `services` rows generated for remaining days
   - `earnings` updated
6. Switch to customer view → banner shows "Partner Assigned" card with name/rating/dates
7. Switch to admin → `admin.manual-assignment` shows the assignment

Capture screenshots at each step. Report any breakage and fix before declaring done.

## Files Touched

- `src/components/partner/DailyShineOfferCard.tsx` — richer card UI
- `src/components/customer/AwaitingPartnerBanner.tsx` — assigned-partner success view
- `src/lib/subscription-assignment.functions.ts` — move ranking + enrichment to TS, persist score
- `src/lib/route-optimize.ts` — add `estimateInsertionCostSeconds` helper
- Migration — add 6 columns to `subscription_offers`

## Out of Scope (defer)

- Push notifications to customer device
- Partner offer history UI
- Admin score-breakdown visualization (data persisted, UI later)
