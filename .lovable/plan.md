# Urban Wash Trial Launch — Audit & Completion Plan

This is a large scope (15 phases). To keep each step reviewable and avoid one giant unverifiable commit, I will ship in **4 batches**. After each batch you can test and tell me to continue.

---

## Batch A — Data integrity & core fixes (Phases 2, 10, 14, parts of 1)

**Goal:** verify the foundation is correct before adding image/realtime work.

1. **Assignment acceptance audit (Phase 2)**
   - Confirm `accept_assignment_v2` actually: creates `assignments` row, reserves `services` rows, scopes customers to `home_area` only (currently it sorts by area but doesn't strictly filter — will tighten to `WHERE c.area = v_home_area`).
   - Confirm `/app/assignments` redirects to `/app/my-assignment` on success (already wired — will verify).
   - Hide the Assignment Builder when `getMyAssignment` returns an active assignment (currently the builder route is always reachable — will redirect).
2. **Duplicate Kalyanpur (Phase 10)** — dedupe area list (single source in `src/lib/areas.ts` or platform_settings) and update any seeded data.
3. **Photo cleanup verification (Phase 14)** — confirm `cleanup_old_service_photos` cron is scheduled (only the function exists; will add `cron.schedule` if missing).
4. **Quick audit log** — I'll list the state of every item in Phase 1 (login/OTP, area lock, earnings, referrals, rewards, training, Hindi, etc.) with ✅ / ⚠️ / ❌ so you can see what's actually built before I touch anything else.

---

## Batch B — Vehicle front image (Phase 3, 4, 5)

**Goal:** end-to-end vehicle photo from import → admin edit → partner views.

1. **Schema:** add `vehicles.front_image_path text`; create public storage bucket `vehicle-images` with RLS (admin write, authenticated read).
2. **Import (`/admin/import`):** add image upload column to CSV/manual flow + all the missing fields listed in Phase 4 (Interior/Exterior wash status, Extension Until, etc.).
3. **Admin customer edit:** new `EditCustomerDialog` covering every field in Phase 5 — upload/replace/remove vehicle image.
4. **Partner app display:** show vehicle image above customer/vehicle/color/plate on:
   - `/app/my-assignment` (customer cards if shown)
   - `/app/live` (today's route)
   - `/app/service/$id`

---

## Batch C — Admin ops surfaces (Phases 6, 7, 8, 11, 12)

1. **Monthly wash tracker (Phase 6):** extend `MonthlyWashTracker` — date picker, partner picker, edit, remove (currently only "mark done"). Add `admin_unmark_monthly_wash` RPC.
2. **Renewals dashboard (Phase 7):** rebuild `/admin/renewals` with the 4 filter tabs (today / 3d / 7d / month) and required columns.
3. **Customer timeline (Phase 8):** expand profile timeline to show before/after photos, completion time, duration per service for last 7 days.
4. **Route page "Completed Today" (Phase 11):** keep completed services visible in a collapsed section under active route on `/app/live`.
5. **Admin Live Operations (Phase 12):** verify `/admin/live` shows all 7 metrics, add 15s auto-refresh.

---

## Batch D — Realtime + privacy + final bug pass (Phases 9, 13, 15)

1. **Realtime (Phase 9):** enable Supabase Realtime on `customers`, `vehicles`, `services`, `assignments`; subscribe in partner app (`my-assignment`, `live`, `service/$id`) so admin edits reflect without refresh.
2. **Masked calling (Phase 13):** audit current `calling.functions.ts`. If real masking provider isn't wired, keep the existing UI but ensure raw `customers.phone` is never returned to partner clients — strip it from `getMyAssignment`, route, and service detail payloads (server-side projection). Document that production masking needs a telephony provider (Exotel/Knowlarity) — secret + edge route.
3. **Bug pass (Phase 15):** walk every flow listed, file fixes.

---

## Technical notes

- **Area filtering fix** in `accept_assignment_v2`: change `ORDER BY CASE WHEN c.area = v_home_area THEN 0 ELSE 1 END` to a hard `AND c.area = v_home_area` filter (with a fallback message if <p_cars available in area).
- **Realtime cost:** subscriptions will be component-scoped via `useEffect` + `removeChannel` cleanup to avoid the reconnection-loop billing trap.
- **Phone privacy:** safest path is a SQL view `customers_partner_view` excluding `phone`, plus revoking `phone` column from any partner-facing RPC. Masked call stays as a server fn that takes `customer_id` (not number) and dials through the provider.
- **Vehicle image storage:** public bucket so partner app can render `<img src>` without signed URLs (faster, no signing cost). Customer faces aren't in frame so no PII concern.

---

## What I need from you

Reply with **"start batch A"** (or pick a different starting batch) and I'll execute it end-to-end, then report back with the audit checklist and what's ready to test.

If anything in the plan is wrong scope (e.g. you want masked calling done first, or you want all 15 phases jammed into one commit anyway), say so now.
