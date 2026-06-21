
# Urban Wash Customer App V1 — Phased Plan

Mobile-first **PWA** living inside the same project as the Partner & Admin apps. Shares one Lovable Cloud backend, one auth, one realtime layer. Customers reach it at `/c/*` routes; partners stay on `/app/*`; admins on `/admin/*`. One codebase, three audiences.

## Design system (applies to every phase)

- Background `#FFFFFF`, primary `#F97316` (Urban Wash Orange), ink `#0F172A`, muted `#64748B`, success `#16A34A`, danger `#EF4444`.
- Font: **Outfit** (display) + **Figtree** (body), via @fontsource.
- Rounded-2xl cards, soft shadows, large vehicle hero images, framer-motion micro-animations, bottom tab bar on mobile.
- All tokens go in `src/styles.css`; no hardcoded color classes. Reuse shadcn primitives.

## Phase 0 — Foundations (1 working session)

- New customer route tree under `src/routes/c/` with `_authed` layout (OTP-gated).
- Shared design tokens, fonts, bottom tab bar, push/notification permission helper.
- New tables: `customer_profiles` (auth.users link), `customer_addresses`, `area_waitlist` (Notify Me captures), `app_content` (banners/videos per service), `vehicle_catalog` (make/model/category/image), `service_catalog` (name, desc, price tiers, add-ons, video, category targeting, active), `bookings`, `booking_addons`, `complaints` (extend), `referrals` (extend), `subscription_pauses`, `push_tokens`.
- All new tables get GRANTs + RLS scoped to `auth.uid()`. Admin policies via `has_role`.
- Seed `vehicle_catalog` with the brand/model list + auto-classification (Hatchback/Compact Sedan vs Sedan/SUV).

## Phase 1 — Onboarding & Home (1 session)

- Location screen: GPS or manual search across the 12 service areas.
- "Coming soon" + Notify Me capture for out-of-area.
- Phone OTP login (reuses existing Supabase phone auth used by partners).
- Vehicle add flow with typeahead against `vehicle_catalog`, auto-category, fields (color, reg #, parking notes, image).
- Home: location pill, vehicle switcher (Hoora-style), service category cards with banner image + 30s video.

## Phase 2 — Services, Subscriptions & Booking (1–2 sessions)

- Service detail page (video, benefits, pricing per category, add-ons).
- Daily Shine subscription flows (monthly default) with add-ons, multi-vehicle discount (2 cars 5%, 3+ 10%, all admin-configurable).
- One-Time Wash, Deep Clean, Interior Deep Clean — pricing from `service_catalog`, never hardcoded.
- Booking funnel: Vehicle → Service → Add-ons → Address → Preferred time (Before 7/8/9/10/11/12) → Schedule → Review → Pay → Success.
- **Razorpay integration** (UPI/Cards/Wallets/NetBanking). Server function creates order; webhook (`/api/public/webhooks/razorpay`) verifies signature and marks `bookings.paid_at` / inserts subscription. Will request Razorpay key & secret via add_secret when this phase starts.

## Phase 3 — Subscription Lifecycle, Gallery & Complaints (1 session)

- Active Subscriptions screen: plan, vehicle, dates, completed/remaining/unavailable/extended/compensation days, partner assigned.
- My Bookings (Upcoming/Completed/Cancelled).
- **Service Gallery** by day — before/after photos from existing `service_photos`, 30-day retention.
- Service Status History (Completed, Unavailable, Dirty Vehicle, Parking Issue, Missed, Compensated, Extended).
- Complaint flow (2-hour window after completion) → writes to `complaints`, admin notified.
- Subscription Pause (reasons, auto-extend renewal date).

## Phase 4 — Realtime, Notifications & Profile (1 session)

- Realtime via existing `supabase_realtime` publication on `services` and `bookings` — Partner Assigned / Arrived / Started / Completed / Photos / Dirty / Unavailable / Extension events push to the customer instantly.
- Web Push (PWA) via FCM messaging worker for renewal due, payment success, complaint resolved, pause/resume.
- Profile: personal details, vehicles, addresses, subscriptions, payments, referral code, support, terms, privacy, delete account.
- Referral system reading `referrals` table; rewards admin-configurable.

## Phase 5 — Admin CMS extensions (1 session)

Extend the existing admin panel — no new dashboard:
- Service catalog editor (create/edit/delete services, prices per category, add-ons, banner, 30s video upload).
- Vehicle catalog editor (brands/models/category mapping).
- Pricing & discount config (multi-vehicle %, referral rewards) into `platform_settings`.
- Booking, complaint, pause-request, extension queues.
- Customer-app push composer (broadcast / area / segment).

## Phase 6 — PWA polish & launch

- `manifest.webmanifest`, install prompt, Urban Wash icon set, splash, theme color `#F97316`.
- Offline shell only for the home + gallery views via `vite-plugin-pwa` (`NetworkFirst`).
- Lighthouse pass; Android + iOS install QA; published-URL push smoke test.

## Technical Details (for reference)

- **No new edge functions.** All app-internal logic uses TanStack `createServerFn` under `src/lib/customer.functions.ts`. Razorpay webhook is a server route at `src/routes/api/public/webhooks/razorpay.ts` with HMAC verification.
- **One auth.** Same Supabase user can hold roles `customer`, `partner`, `admin` via `user_roles` — gates by role.
- **One project, three route trees:** `src/routes/c/_authed/*` (customer), existing `src/routes/_authenticated/app.*` (partner), existing `src/routes/admin.*` (admin).
- **Pricing is data, not code.** `service_catalog` rows drive every screen; admin edits propagate via React Query invalidation + realtime.
- **Image/video storage:** new `customer-media` and `service-media` buckets with signed URLs.
- **State:** TanStack Query everywhere, suspense queries in loaders under the customer auth gate.

## What I need from you before starting

1. **Confirm phase 1 start.** I'll begin with Phase 0 + Phase 1 (foundations, onboarding, vehicle add, home).
2. **Razorpay account ready?** Not blocking until Phase 2.
3. **Any service prices I should treat as locked starting values** (the ones in your brief), or do you want me to leave the catalog empty and seed from the admin UI?

Reply "go" and I'll start Phase 0 + Phase 1.
