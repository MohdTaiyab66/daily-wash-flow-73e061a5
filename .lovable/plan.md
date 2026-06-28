# Urban Wash — Final Operational Improvements Plan

Scope: 9 numbered items from the request. No redesigns; fix and connect operational gaps only.

## 1. Current Location (Critical)
- Replace any cached/area-based fallback in `Use Current Location` with real `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })`.
- Reverse geocode via existing Google Maps connector gateway (server fn `reverseGeocode` already-pattern; add if missing) to extract address, area, city, state, pincode.
- Store full payload in `customer_addresses` / `partners.last_location`.
- On denial: show "Enable location" prompt + fallback to manual map pin.
- Files: `src/routes/c/location.tsx`, `src/routes/c/location.search.tsx`, `src/routes/_authenticated/app.area.tsx`, `src/routes/_authenticated/app.live.tsx`, new `src/lib/geo.functions.ts`.

## 2 & 3. Vehicle Search + Complete Database
- Seed `vehicle_catalog` (currently 4 rows) with ~250 popular India-market models across all listed brands, each with `make`, `model`, `aliases[]`, `body_type` (Hatchback / Compact Sedan / Sedan / SUV / MUV / Luxury), `image_url`, `colors[]`.
- Migration adds columns `aliases text[]`, `body_type text`, `image_url`, `colors text[]` if missing.
- Rewrite vehicle search in `vehicles_.add.tsx` to use ILIKE OR on `make`, `model`, `aliases` with prefix + substring scoring; debounced 150ms; shows top 20.
- Category is derived from `body_type`, never chosen by customer.

## 4. Services & Pricing
- Wipe & re-seed `service_catalog` with exact pricing matrix from the brief:
  - Daily Shine sub: 999 / 1199 + add-ons (Interior 149/199, Exterior 149/199, Polish 49, Dusting 25)
  - One-Time Wash: 399/499 full, 349/449 without polish + Seat 499, Roof 499
  - Deep Clean: 1099/1399 full, 899/999 interior-only
  - Additional: Body Polish 49, Dusting 25, Seat 499, Roof 499, Buffing 999, Cutter+Polish 1999
- Add column `category` flag {subscription, one_time, deep_clean, addon, premium} to drive routing.
- Pricing auto-switches by `body_type` group (hatchback_compact vs sedan_suv).

## 5. Service Routing Logic
- Update `bookings` insert trigger / payment success handler: only `service_type='subscription'` (Daily Shine family) creates a `subscription_assignment_queue` row → partner marketplace.
- All other categories create a `service_leads` row instead (new table).
- Update `payment.functions.ts` post-payment branch accordingly.

## 6. Admin Service Leads Module (New)
- New table `service_leads` (customer, vehicle, address, service, price, payment_id, scheduled_at, status, assigned_detailer_id, notes, photos[], timestamps) + RLS + GRANTs + Realtime publication.
- RPCs: `admin_assign_detailer`, `admin_update_lead`, `admin_cancel_lead`, `admin_complete_lead`.
- New route `src/routes/admin.service-leads.tsx` with table, filters (status/date/service), assign dialog, search, CSV export.
- Sidebar entry added between Customers and Marketplace.

## 7. Daily Shine Add-on Notifications
- New table `subscription_addon_requests` (subscription_id, customer_id, service_id, preferred_date, preferred_time, status, assigned_detailer_id, completed_at, cancelled_at).
- When subscriber requests Interior/Exterior/Pressure wash from `c/subscriptions.tsx`, insert here — NOT into partner queue.
- New route `src/routes/admin.addon-queue.tsx` for management.
- Admin notification via existing `admin_alerts`.

## 8. Admin Settings linkage
- Audit all keys touched by sections 1–7 to ensure they read from `platform_settings` live (no constants). Settings UI already exists from prior pass.

## 9. End-to-End Verification
- Playwright smoke: Daily Shine → marketplace, One-Time → service lead, Add-on → addon queue. Produce final PASS/PARTIAL/FAIL report.

## Out of scope
- No visual redesigns. No removal of existing features. No new auth flows.

## Order of execution
1. Migration: vehicle_catalog columns, service_catalog reseed, service_leads, subscription_addon_requests, routing trigger update, realtime + GRANTs.
2. Seed vehicle_catalog (~250 rows) via insert tool.
3. Geo server fn + client hooks.
4. Vehicle search UI.
5. Service Leads + Addon Queue UIs + sidebar.
6. Payment routing branch.
7. Playwright verification + report to `/mnt/documents/UrbanWash_Final_Ops_Report.md`.
