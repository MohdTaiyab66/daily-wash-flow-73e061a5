# Urban Wash Trial Mode — Execution Plan

This is a large scope. I'll execute in **3 sequential batches**, finishing the Partner Panel completely before touching Admin. After each batch you confirm before I move on.

---

## BATCH 1 — Partner Panel completion (no UI redesign)

**Database (single migration):**
1. `vehicles.front_image_path TEXT` + create public `vehicle-images` storage bucket with RLS (public read, admin write).
2. `customers.service_required_before TEXT` (values: `07:00`/`08:00`/`09:00`/`10:00`/`11:00`). Backfill from existing `preferred_time`.
3. `platform_settings` keys: `route_visibility_until` (default `10:00`, allowed `10:00|11:00|12:00|13:00|all_day`), `trial_manual_assignment_enabled` (default `false`).
4. New RPC `get_my_route(p_date)` returning pending + completed-today with vehicle image, service_required_before, completion_time, duration.

**Partner app changes:**
- **My Assignment** (`app.my-assignment.tsx`): add Start Date, End Date, Completed Today, Remaining Today, Total Services, Expected Total Earnings, Available Payout, Progress %. Pull from extended `getMyAssignment`.
- **Today's Route** (`app.live.tsx` / `app.index.tsx`): split into **Pending** and **Completed Today** sections. Completed card shows customer, vehicle, completion time, duration. Hide route after `route_visibility_until` unless `all_day`.
- **Vehicle image**: render `vehicles.front_image_path` above customer/vehicle/color/plate in My Assignment list, Today's Route cards, and Service Details (`app.service.$id.tsx`).
- **Service-required-before** badge replaces generic time slot on route + service detail.
- **Partner map view** inside Today's Route: reuse `LiveMap` to show partner location + numbered customer pins + polyline route path.

**Final partner-panel status report** (COMPLETED / PARTIAL / NOT IMPLEMENTED) for every Phase 1–15 item.

---

## BATCH 2 — Admin operational controls

1. **Manual Assignment** (`/admin/manual-assignment`): pick partner → multi-select customers → duration → submit. New RPC `admin_create_manual_assignment(...)` bypassing area filter, gated by `trial_manual_assignment_enabled`.
2. **Trial Mode toggle** + **Route Visibility selector** in `/admin/settings`.
3. **Customer editing** (`/admin/customers/$id`): full edit dialog covering every field listed (name, phone, area, lat/lng, vehicle, image upload, plate, color, parking, plan, service_required_before, start/extension/renewal dates, status, assigned partner). New RPC `admin_update_customer(...)`.
4. **Customer import** (`/admin/import`): add vehicle image upload (mandatory), service_required_before dropdown, extension_until, renewal_date, status, assigned_partner.
5. **Admin overview** (`/admin/index.tsx`): wrap each stat card in `<Link>` to its module.

---

## BATCH 3 — Admin map + realtime polish

1. **Customer Map** (`/admin/customer-map`): plot all customers, color-coded (green active / orange renewal-due-7d / red inactive), popup with name, vehicle, plan, renewal, partner, status.
2. **Realtime**: enable Realtime publication on `services`, `assignments`, `customers`; subscribe in My Assignment + Today's Route (component-scoped, cleanup on unmount).
3. Final cross-module bug pass on all 12 modules from your section 12.

---

## Technical notes
- Manual assignment uses the existing `assignments` + `services` schema — no parallel system. The flag only relaxes the area filter and skips `min_assignment_days_new`.
- Vehicle image bucket is public-read so partner app `<img src>` works without signed URLs; uploads gated by `has_role(..., 'admin')`.
- Route visibility is enforced client-side (cheap, partner can't bypass anything meaningful — the assignment itself isn't hidden, only the route surface).

---

**Reply `go batch 1`** to start with Partner Panel, or tell me to reorder / drop items.
