
# P0 – Partner Lead Acceptance & Realtime Notification System

Scope covers all 12 issues raised. Grouped by area so we can ship in one coherent pass without touching unrelated modules.

## 1. Notification data model (DB migration)

Extend `partner_notifications` and add matching admin table:

- Add `category` text (`daily_shine | dar | wallet | system | assignments | premium | payments | expansion | alerts | bookings`), `subject_type`, `subject_id`, `metadata jsonb`.
- Backfill existing rows to sensible categories from `type`.
- New table `admin_notifications` (id, category, title, body, link, subject_type, subject_id, metadata, read_at, created_at) + RLS restricted to admins, GRANT to authenticated/service_role.
- Helper RPC `notify_admins_new_booking(booking_id)` and `notify_partner_new_offer(offer_id)` — SECURITY DEFINER — producing correctly-linked notifications with `link = /app/leads/:offerId` for partners and `/admin/service/:id` (premium) or `/admin/live` (daily shine) for admin.

## 2. Booking → routing rules (DB triggers)

Single trigger on `bookings` insert:

- If service is **Daily Shine** → enqueue via existing `subscription_assignment_queue` + `pick_scored_partner_for_queue` (no change); ensure `notify_partner_new_offer` fires when a `subscription_offers` row is inserted.
- If service is **Premium / Interior / Exterior / Deep Clean** → **do NOT** enqueue in Daily Shine marketplace. Instead insert into `admin_notifications` (category=`premium`/`bookings`) and mark booking `assignment_state = 'awaiting_admin'`.
- Always insert an `admin_notifications` row for every new booking (category by service_type).

This kills issue 6 (premium leaking into DS marketplace).

## 3. Partner offer popup / lead page

Rework so notification "Open" always lands on a dedicated **Lead Details** route:

- New route `src/routes/_authenticated/app.leads.$offerId.tsx`
  - Loads offer via `get_offer_details_for_partner(offer_id)` (new SECURITY DEFINER RPC returning customer name, vehicle, area, address, distance-from-nearest-assignment, route delta, ₹/day, ₹/month, working days, hours, expires_at).
  - Renders full details + Accept / Decline calling existing `respond_subscription_offer`.
  - Countdown + auto-expire (client polls, server tick already handled by `assignment-tick` cron).
- `OfferPopup` remains as **foreground heads-up** but its CTA "View full details" navigates to `/app/leads/:offerId`. Popup stays for quick Accept/Decline.
- `partner_notifications.link` for offers set to `/app/leads/:offerId` (fix issue 1, 3).

## 4. Distance = nearest assigned customer

New SQL helper `distance_from_partner_route(partner_id, lat, lng)`:
- Reads partner's active assignments (today's route stops), returns min haversine distance to any stop's lat/lng, plus rough route delta (2× distance / avg speed).
- If partner has no assignments today, falls back to partner home coords.
- Wired into `pick_scored_partner_for_queue` output + surfaced in lead details and popup (replaces `distance_from_route_m` current value where GPS was used).

## 5. FCM push (foreground + background + killed)

- Cron `offer-push-dispatch.ts` already sends FCM on new offers. Update payload:
  - `data.link = /app/leads/<offerId>`
  - `data.category = daily_shine`
  - `notification.click_action = FLUTTER_NOTIFICATION_CLICK` + Android channel `daily_shine_leads` with high importance (heads-up on device).
- Native handler in `src/lib/push/fcm.ts`: on `pushNotificationActionPerformed`, read `data.link` and `router.navigate({ to: data.link })`. Handles killed + background taps (issue 3).
- Foreground: when push arrives while app open, rely on existing realtime `OfferPopup` (already ringing + vibrating).

## 6. Accept flow realtime

`respond_subscription_offer` (accept branch) already:
- Creates assignment, adds to route. Verify + patch:
  - Insert `partner_notifications` (category=`assignments`, title="New customer added", link=`/app/my-assignment`).
  - Insert `admin_notifications` (category=`assignments`).
  - Insert `customer_notifications` ("Your Daily Shine partner is assigned").
  - Broadcast handled by Realtime on the tables the customer/admin already subscribe to.

## 7. Decline flow → DAR next partner

Existing `respond_subscription_offer(false)` already reinserts into queue; ensure:
- Declined offer row marked `response='declined'`, cannot be re-offered to same partner (unique index `(queue_id, partner_id) where response in ('declined','expired')`).
- Assignment tick cron picks next eligible partner and creates a new offer → new notification.

## 8. Notification Center categories

`app/notifications` page:
- Tabs: All / Daily Shine / Assignments / DAR / Wallet / System.
- Filter by `category`. Grouping headers, unread badges per tab.
- "Open" uses `notification.link`; if it's a lead offer link, navigate to lead details.

Add admin equivalent at `src/routes/admin.notifications.tsx` with tabs Bookings / Premium / Assignments / Payments / Expansion / Alerts, plus a bell in admin shell.

## 9. Auto-expire 90s

Already 90s in offer creation. Add `assignment-tick` guard: on expiry, mark `response='expired'`, insert `partner_notifications` (category=`dar`, "Lead expired"), reinsert queue for next partner. Runs each minute — acceptable for 90s window with realtime for the accept side.

## 10. Regression checklist (must retain)

- DS marketplace still lists queue for admin view (issue 6 changes only push routing, not admin marketplace listing which stays DS-only).
- DAR page, partner route, assignment builder, wallet, customer timeline unchanged.
- Existing pre/post payment logic untouched.
- Cancellation window untouched.

## Files

**New**
- `supabase/migrations/<ts>_partner_lead_notifications.sql` — schema + RPCs + triggers.
- `src/routes/_authenticated/app.leads.$offerId.tsx`
- `src/routes/admin.notifications.tsx`
- `src/components/admin/AdminNotificationBell.tsx`

**Edited**
- `src/routes/_authenticated/app.notifications.tsx` — categories/tabs, link routing.
- `src/components/partner/OfferPopup.tsx` — CTA to lead details, use RPC distance.
- `src/lib/push/fcm.ts` — action handler navigates to `data.link`.
- `src/routes/api/public/cron/offer-push-dispatch.ts` — payload category + link + channel.
- `src/routes/api/public/cron/assignment-tick.ts` — expiry notification.
- `src/routes/admin.tsx` — nav entry + bell.
- `src/integrations/supabase/types.ts` — regenerated after migration approval.

## Technical Notes

- `notification-push` hook (existing) will fanout the new `admin_notifications` and `partner_notifications` inserts via FCM using each row's `link` — one code path for both.
- Heads-up on Android requires `IMPORTANCE_HIGH` channel; will be created in `startFcm` on first run.
- All new tables get GRANTs + RLS in the same migration.

Ready to implement on approval.
