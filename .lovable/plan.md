
## Goal

Guarantee — and prove — that every service/premium row references the exact car the customer selected at booking time. Ship an audit UI, hard DB guardrails, an automated multi-car test, and traceable logs on both ends.

---

## 1. Database: constraints, triggers, backfill

New migration `20260705170000_vehicle_integrity.sql`:

- **Backfill** existing rows first (before adding the reject trigger, so it doesn't block itself):
  - `UPDATE services s SET vehicle_id = b.vehicle_id, vehicle_label = <make model reg> FROM bookings b WHERE s.booking_id = b.id AND s.vehicle_id IS DISTINCT FROM b.vehicle_id`.
  - Same pass for `subscription_addon_requests` and any premium/booking-derived tables that carry a `vehicle_id`.
- **FK hardening**: `ALTER TABLE public.services ADD CONSTRAINT services_vehicle_fk FOREIGN KEY (vehicle_id) REFERENCES public.customer_vehicles(id)` (via NOT VALID + VALIDATE to avoid locking; skipped if it already matches).
- **Reject trigger** `tg_services_enforce_booking_vehicle` BEFORE INSERT OR UPDATE OF vehicle_id, booking_id, customer_id ON `public.services`:
  - If `booking_id` is not null and `NEW.vehicle_id` ≠ `bookings.vehicle_id`, `RAISE EXCEPTION 'vehicle_mismatch: service.vehicle_id % != bookings.vehicle_id %'`.
  - If `NEW.vehicle_id` is not owned by `NEW.customer_id` in `customer_vehicles`, raise.
  - Also refresh `vehicle_label` from `customer_vehicles` so labels can never drift.
- Same trigger shape on `subscription_addon_requests` (compare against the row's own `vehicle_id`/subscription owner).
- **Audit log table** `public.vehicle_trace_log` (booking_id, service_id, vehicle_id, customer_id, source enum: `customer_schedule|admin_render|activate_booking|create_addon|route_generate|trigger_reject`, payload jsonb, actor uuid, created_at) with GRANTs + RLS (only admins can read via `has_role`).
- RPC `log_vehicle_trace(p_source, p_booking_id, p_service_id, p_vehicle_id, p_customer_id, p_payload)` — SECURITY DEFINER, callable by `authenticated` — inserts one row.

## 2. Admin audit screen

New route `src/routes/admin.vehicle-audit.tsx` (linked from `admin.tsx` sidebar):

- Tabs: **All services** and **Mismatches**.
- Server fn `getVehicleAudit({ scope: 'all'|'mismatch', limit })` in `src/lib/audit.functions.ts` under `requireAdmin`; joins services → bookings → customer_vehicles and returns:
  - `service_id`, `booking_id`, `scheduled_date`, `customer_name`
  - `service_vehicle_id`, `booking_vehicle_id`
  - `service_vehicle_label`, `booking_vehicle_label`, `booking_vehicle_reg`
  - `mismatch` boolean (either id or label differs)
- Second server fn `getVehicleTraceLog({ booking_id })` for a drill-in drawer that shows every trace event for a booking chronologically.
- UI: shadcn Table with a red badge on mismatch rows, filters by date range and customer search, "View trace" opens a Sheet with the log timeline.

## 3. End-to-end trace logging

Add small `traceVehicle(source, payload)` helper in `src/lib/vehicle-trace.ts` that:
- Console: `console.info("[vehicle-trace]", source, { booking_id, vehicle_id, ... })`.
- Fire-and-forget calls the `log_vehicle_trace` RPC (skips silently on failure).

Instrumentation points:
- `src/routes/c/_authed/service.$slug.tsx` — before creating the booking and after `activate_paid_booking` returns.
- `src/routes/c/_authed/subscriptions.tsx` — on `create_addon_request` call.
- Admin route render: `src/routes/admin.service.$id.tsx` and `admin.customers.$id.tsx` on load (source `admin_render`).
- DB side: `tg_services_enforce_booking_vehicle` inserts a `trigger_reject` row before raising, and `generate_services_for_queue` inserts a `route_generate` row per service produced.

## 4. Playwright end-to-end test

`scripts/test-vehicle-integrity.mjs` — Playwright script (headless Chromium) that:

1. Uses `supabaseAdmin` (via a small helper script that reads `SUPABASE_*` from env) to seed:
   - One customer + auth user with a known password.
   - Three `customer_vehicles`: Maruti Swift, Hyundai Venue, Honda City (distinct regs).
2. Signs in as the customer in the preview, and for each car:
   - Opens `/c/subscriptions`, switches the VehicleSelector, books an add-on for a fixed date.
   - Screenshots to `/tmp/browser/vehicle-integrity/`.
3. Signs in as an admin user and:
   - Opens `/admin/vehicle-audit` → asserts the three new bookings appear with `mismatch=false`.
   - Opens each `/admin/service/<id>` and asserts the visible make/model/reg matches the booked car.
4. Runs a **negative test**: directly attempts `UPDATE services SET vehicle_id = <other-car>` via service-role SQL — expects the trigger to raise `vehicle_mismatch`.
5. Exits non-zero on any assertion or unexpected success.

Auth: the script uses env vars `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_CUSTOMER_EMAIL`, `TEST_CUSTOMER_PASSWORD`; on Lovable Cloud it falls back to seeding with `supabaseAdmin.auth.admin.createUser` and signing in with those credentials. Cleanup at end deletes the seeded rows.

Documented in `docs/TEST_VEHICLE_INTEGRITY.md` with run command.

---

## Technical details

- Files created:
  - `supabase/migrations/20260705170000_vehicle_integrity.sql`
  - `src/lib/audit.functions.ts`
  - `src/lib/vehicle-trace.ts`
  - `src/routes/admin.vehicle-audit.tsx`
  - `scripts/test-vehicle-integrity.mjs`
  - `docs/TEST_VEHICLE_INTEGRITY.md`
- Files edited:
  - `src/routes/admin.tsx` (nav entry)
  - `src/routes/c/_authed/service.$slug.tsx`, `c/_authed/subscriptions.tsx` (trace calls)
  - `src/routes/admin.service.$id.tsx`, `admin.customers.$id.tsx` (trace on render)
  - `src/integrations/supabase/types.ts` regenerates after migration approval
- The reject trigger runs BEFORE INSERT/UPDATE so app-level RPCs (`activate_paid_booking`, `create_addon_request`, `generate_services_for_queue`) that already pass the right vehicle continue to work; any code path that regresses will fail loudly instead of silently mis-labelling.
- Trace-log RLS: only `authenticated` with `has_role(auth.uid(),'admin')` can SELECT; anyone authenticated can INSERT via the SECURITY DEFINER RPC (never direct table write).
- Playwright driven via `code--exec` per project browser rules; screenshots viewed to verify.

Approve to proceed and I'll ship the migration + files in one pass.
