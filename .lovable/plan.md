# P0 — Vehicle-Specific Daily Shine + Plan Inclusions

Two coordinated changes: (1) make every Daily Shine surface scoped to the selected vehicle, (2) introduce a normalized `plan_inclusions` table with an admin editor. Shipped in one pass so customers never see mixed-vehicle data again.

## 1. Database

New table `public.plan_inclusions`:

```text
id            uuid pk
plan_slug     text not null   -- matches service_catalog.slug (e.g. 'daily-shine')
title         text not null
description   text null
icon          text null       -- lucide icon name, e.g. 'droplets'
display_order int  not null default 0
is_active     bool not null default true
created_at    timestamptz
updated_at    timestamptz
```

- Index on `(plan_slug, display_order)`.
- RLS: `SELECT` open to `anon` + `authenticated` where `is_active = true`; full CRUD to admins via `has_role`. GRANTs per Lovable Cloud rules.
- Seed the six Daily Shine inclusions from the spec.
- Trigger `update_updated_at_column` on update.

Notifications: add nullable `vehicle_id uuid` to `customer_notifications` (FK → `customer_vehicles`, ON DELETE SET NULL) so future notifications can label the vehicle. Backfill left null; UI shows vehicle name when present.

No other schema changes. `bookings.vehicle_id`, `subscriptions.vehicle_id`, `services.vehicle_id`, `dirty_vehicle_reports.vehicle_id`, `service_photos` (via service) already exist — we filter on them.

## 2. Customer App — `src/routes/c/_authed/subscriptions.tsx`

Rewrite around a **selected vehicle**:

- Header right side: vehicle selector dropdown (`🚙 Tata Safari ▼`) listing all customer vehicles + `+ Add Vehicle` (routes to `/c/vehicles/add`). Selected id stored in `useState` + `sessionStorage("uw:selectedVehicleId")` so it survives navigation within the session. Default = first vehicle with an active subscription, else first vehicle.
- All queries below scoped by `vehicle_id = selectedVehicleId`:
  - `subscriptions` (single row per vehicle: `.eq("vehicle_id", …)`)
  - `bookings` (recent + counters)
  - `services` (today's live status)
  - `dirty_vehicle_reports` / `unavailability_reports`
  - `booking_addons` (via that vehicle's booking ids)
  - `plan_inclusions` (by `subscriptions.plan_slug`)
- If no active subscription for the selected vehicle: hide plan/progress/history/photos and show a **No Active Subscription** empty state with a large `Subscribe Now` CTA → navigates to `/c/service/daily-shine?vehicleId=<id>`.
- Active plan card gains: vehicle icon + name, plan name, paid badge, price, **What's Included** list rendered from `plan_inclusions`.
- Progress, This Month tiles, Recent Services all read from the vehicle-scoped bookings/services.

Booking flow (`service.$slug.tsx`): read `vehicleId` search param and pre-select that vehicle; skip the vehicle picker step when present.

`AwaitingPartnerBanner` becomes vehicle-scoped: accepts `vehicleId`, filters `subscriptions` / `services` / `queue` by it. Existing "hard block" against showing `unassignable` when a partner exists is kept.

`RecentServiceFeed` accepts `vehicleId` and filters services + photos + complaints by it.

`bookings.tsx` (Bookings tab): show the same vehicle selector at top and filter list by vehicle.

Notifications list: when a row has `vehicle_id`, prefix the title with the vehicle name.

## 3. Admin

**Plan Inclusions editor** — new route `/admin/plan-inclusions` (linked from `admin.settings.tsx` under a new "Subscription Plans" section):

- Plan selector (lists distinct `service_catalog` rows where `service_type = 'subscription'`).
- Table of inclusions for that plan: title, description, icon picker (curated lucide set: droplets, wrench, sparkles, sprayCan, shield, car, calendar, check), active toggle, up/down reorder buttons, edit, delete.
- Add inclusion dialog.
- Live preview panel rendering exactly like the customer card.
- All writes go through admin-only server functions (`requireSupabaseAuth` + `has_role` check).

**Customer detail page** (`admin.customers.$id.tsx`): group existing per-customer sections under a **Vehicles** tab list — one panel per vehicle with that vehicle's Subscription, Assigned Partner, Progress, Photos, Booking history. Reuses existing queries with `.eq("vehicle_id", v.id)`. No merged view.

## 4. Server Functions

Add to `src/lib/admin.functions.ts`:

- `listPlanInclusions({ plan_slug })` — public read (active only) + admin read (all).
- `adminUpsertPlanInclusion` — admin only.
- `adminDeletePlanInclusion` — admin only.
- `adminReorderPlanInclusions({ plan_slug, ordered_ids })` — admin only, single UPDATE using CASE.

Customer app reads `plan_inclusions` directly via the browser Supabase client (RLS returns only `is_active` rows to non-admins).

## 5. Regression Guards

- Existing subscriptions untouched (no data migration on subscriptions/bookings).
- Billing, renewals, assignment, DAR: no changes to their tables or flows.
- Booking flow unchanged when `vehicleId` search param absent.
- If a customer has no vehicles: show today's existing empty state.
- Unique index `uq_subscriptions_vehicle_open` already prevents two active subs per vehicle — matches new UI model.
- `AwaitingPartnerBanner`: existing rule "never show 'unable to assign' when a partner is assigned" preserved and now scoped per vehicle.

## 6. Test Matrix

Verify manually against seed data plus a scripted probe:

- 1 vehicle, subscribed → full plan view.
- 2 vehicles, 1 subscribed → selector switches to empty state on unsubscribed.
- 2 vehicles, both subscribed → each shows its own partner / progress / history.
- 3 vehicles, different plans → inclusions differ per plan.
- Subscribe Now from empty state → booking flow lands on Daily Shine with the right vehicle pre-selected.
- Admin editor: add / edit / reorder / disable → customer sees change on next query.
- Admin customer detail: each vehicle tab shows only its own data.

## Files

New: `supabase/migrations/<ts>_plan_inclusions.sql`, `src/routes/admin.plan-inclusions.tsx`, `src/components/customer/VehicleSelector.tsx`, `src/components/customer/PlanInclusionsCard.tsx`, `src/components/customer/NoSubscriptionState.tsx`.

Edited: `src/routes/c/_authed/subscriptions.tsx`, `src/routes/c/_authed/bookings.tsx`, `src/routes/c/_authed/service.$slug.tsx`, `src/components/customer/AwaitingPartnerBanner.tsx`, `src/components/customer/RecentServiceFeed.tsx`, `src/routes/admin.customers.$id.tsx`, `src/routes/admin.settings.tsx`, `src/lib/admin.functions.ts`.

Approve to proceed.
