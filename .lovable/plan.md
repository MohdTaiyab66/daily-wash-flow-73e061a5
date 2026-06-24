# Remove Skip-Login / Guest Flow — Login-First Customer App

Reverting the guest-first onboarding we built in earlier turns. Login becomes mandatory before entering the app, matching Urban Company's pattern.

## New flow

```
Splash (1s, logo + "Making Every Ride Shine")
  → Login (mobile + optional referral, T&C)
  → OTP verification (auto-create account)
  → Location selection (current / manual, supported-area check)
  → Home
```

No "Skip", no "Continue as Guest", no guest cart, no guest vehicle, no journey-preservation redirects.

## Files to DELETE

Routes:
- `src/routes/c/welcome.tsx` (becomes the login screen — see below; old "skip" version removed)
- `src/routes/c/g.checkout.tsx`
- `src/routes/c/g.service.$slug.tsx`
- `src/routes/c/g.vehicles.tsx`
- `src/routes/c/g.vehicles.add.tsx`
- `src/routes/admin.funnel.tsx`

Libraries:
- `src/lib/guest-cart.ts`
- `src/lib/funnel.ts`

## Files to EDIT

- `src/routes/c/index.tsx` — splash: show logo + tagline, auto-redirect to `/c/auth` after 1s (no skip button). Authed users go to `/c/home`.
- `src/routes/c/auth.tsx` — new login screen (mobile + referral + T&C) → OTP → on success redirect to `/c/location` if no address yet, else `/c/home`. Drop all guest-vehicle migration logic.
- `src/routes/c/services.tsx` — remove guest branches; this route moves under `_authed`. (Rename file to `src/routes/c/_authed/services.tsx`.)
- `src/routes/c/location.tsx` + `location.search.tsx` — move under `_authed`, require login, keep supported-area list, show "coming soon" for unsupported.
- `src/routes/c/_authed/vehicles.tsx` / `vehicles_.add.tsx` — confirm auto-category detection via `vehicle_catalog` + `src/lib/vehicle-category.ts` fallback; ensure "Remove vehicle" button present.
- `src/routes/admin.tsx` — replace "Funnel" nav entry with "Customer Analytics".
- Create `src/routes/admin.customer-analytics.tsx` — Total customers, Active customers (booked in last 30d), Active subscriptions, Daily Shine subs, Bookings today, Revenue today, Revenue this month. Pure read queries against existing tables.

## Database

- Drop `funnel_events` table (created last turn; nothing else references it).
- No other schema changes. `customer_vehicles`, `customer_addresses`, `bookings`, etc. unchanged.

## Verification (after edits)

1. `tsgo` typecheck clean.
2. Playwright run hitting `/c` → confirm redirect to `/c/auth` after splash, no skip button visible.
3. Confirm `/c/g.*` URLs 404.
4. Admin nav shows "Customer Analytics", not "Funnel".

## Final report (delivered after implementation)

Lists of: removed components, removed routes, dropped tables, removed analytics events.

---

Confirm and I'll execute. This is a destructive cleanup — once approved I'll delete the guest files, drop `funnel_events`, and rewire the auth-gated flow in one pass.
