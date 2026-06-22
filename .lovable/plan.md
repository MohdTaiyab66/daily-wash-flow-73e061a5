# Urban Wash Customer App V1 — Build Plan

Your spec is large enough that shipping it as one change would burn a lot of credits and be impossible to review. I'm splitting it into 6 phases. Each phase is independently testable and ends with a working app.

A lot of the foundation already exists from prior turns:
- Customer auth (phone OTP), `/c` shell with Home / Bookings / Profile / Vehicles
- `customer_profiles`, `customer_vehicles`, `customer_addresses`, `bookings`, `booking_addons`, `area_waitlist`, `service_catalog` tables
- Area-gating + "coming soon / Notify me"
- Service detail → address → confirm flow (cash-on-service)
- Orange / black / white theme matching partner app

## Phase A — Data model + admin-driven catalog (foundation)
Goal: make EVERYTHING admin-editable, no hardcoded prices.

- Migration: extend `service_catalog` with `category` (hatchback_compact | sedan_suv), `video_url`, `benefits[]`, `duration_min`, `active`, `sort_order`, `addon_ids[]`.
- New `service_addons` table (name, price_hatch, price_suv, icon_url, applies_to_service_ids[]).
- New `vehicle_catalog` enrichment: `category` enum (hatchback | compact_sedan | sedan | suv), `image_url`, `brand`, `model`. Seed with ~150 popular Indian models (Maruti / Hyundai / Honda / Toyota / Mahindra / Tata / Kia / MG / Skoda / VW / Renault / Nissan / Jeep + premium).
- New `multi_vehicle_discounts` table (vehicle_count, percent) — admin configurable.
- New `referral_config` + `customer_referrals` already exists, wire up admin edits.
- Seed all your exact prices (₹999/₹1199 daily shine, ₹349/₹399/₹499 one-time, ₹1099/₹1399 deep clean, ₹899/₹999 interior deep clean, add-ons ₹25/₹49/₹149/₹199/₹499/₹999/₹1999) as initial rows — but read from DB everywhere.
- Admin pages: `/admin/services` (CRUD + image/video upload), `/admin/addons`, `/admin/vehicle-catalog`, `/admin/discounts`, `/admin/referrals`.

## Phase B — Vehicle intelligence + auto-categorization
- Vehicle add page with typeahead search against `vehicle_catalog` — type "fortuner" → shows "Toyota Fortuner" with image.
- On select, category is auto-resolved (customer never picks).
- Multi-vehicle support already in schema; add UI for default vehicle + per-location grouping.
- Show large vehicle image + name on home (Hoora-style switcher).

## Phase C — Booking funnel v2 (replaces current service.$slug)
Vehicle → Service → Add-ons (with icons + pictures) → Address → Time slot (Before 7/8/9/10/11 AM, 12 PM) → Schedule date → Review (shows multi-vehicle discount auto-applied) → Payment → Success.

- Daily Shine = subscription (creates row in `subscriptions` with renewal date, remaining services).
- One-Time / Deep Clean = single booking.
- 30-sec video player on service detail.

## Phase D — Razorpay payment (BLOCKED — needs your keys)
- Server fn `createRazorpayOrder` (uses secret).
- Server fn `verifyRazorpayPayment` (HMAC verify → insert booking as paid).
- Migration: add `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` to `bookings`.
- Checkout.js modal in service page; "Pay at service" fallback toggle.

**I need you to add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` via the secrets prompt before I can build this phase.**

## Phase E — Subscriptions, service gallery, complaints, live partner
- `/c/subscriptions` — plan, vehicle, start/renewal, completed/remaining, unavailable/extended/compensation days, assigned partner.
- `/c/bookings/$id` — before/after photos (from `service_photos`), partner name, completion time, duration. 30-day retention banner.
- Complaint button visible for 2h after `completed_at`; types match your list; inserts into `complaints`.
- Pause flow → writes `subscription_pauses` (already exists), auto-extends renewal.
- Live partner arrival: subscribe to `services` realtime; toast + push when `status = in_progress` / `arrived`.

## Phase F — Notifications, referrals, profile polish
- Push tokens via `push_tokens` (already exists); web push for now, FCM/APNs when you go native.
- In-app notifications list (partner assigned/arrived/started/completed, renewal, payment, complaint resolved, extension, pause/resume).
- Referral screen with share code + reward config from admin.
- Profile menu: Personal / Vehicles / Addresses / Subscriptions / Payments / Referral / Support / T&C / Privacy / Delete Account.

## Native Android + iOS
TanStack Start builds a web app. To ship to Play Store / App Store we wrap with **Capacitor** (adds `android/` and `ios/` projects, reuses the same code). I'll add this in Phase F.

## Realtime sync
Enable realtime publication on `service_catalog`, `service_addons`, `bookings`, `services`, `subscriptions` so admin price changes / partner status changes reflect instantly in customer + partner apps.

---

## What I need from you to start

1. **Confirm we start with Phase A** (foundation migration + admin catalog editors). Without it everything else is hardcoded and not what you asked for.
2. **Add Razorpay secrets** when you're ready — I'll prompt for them at the start of Phase D so Phase A–C aren't blocked.
3. **30-sec videos** — do you have them yet, or should admin upload come first and you add videos later?
4. Reply "go" and I'll start Phase A (one migration + admin pages, ~1 batch of edits).

Findings from your scan that I am NOT touching in this build (mentioned per your earlier instruction): everything outside the 11 IDs you listed previously.