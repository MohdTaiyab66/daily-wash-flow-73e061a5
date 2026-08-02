# Urban Wash Customer App — Production Polish

Scope: frontend/presentation only. No backend API, Supabase schema, payment, or booking business-logic changes. Partner app untouched except shared tokens.

## Phase 1 — Startup, auth and session (items 1, 2, 3, 4, 5)

- Collapse the double splash: `/c` splash becomes the single gate. Reduce the artificial 1s delay to a session check that resolves as soon as Supabase answers, with a 300ms minimum so it doesn't flash. The orange logo page before login is removed; the login screen keeps a compact brand lockup only.
- Auto login: session already persists via Supabase local storage. Add an explicit boot path — session valid → `/c/home` (or `/c/location` if no area saved); no session/expired/refresh failure → `/c/auth`. Add a global `onAuthStateChange` handler for `SIGNED_OUT` / `TOKEN_REFRESHED` failure so an expired session sends the user back to login instead of a blank screen.
- Login screen: reduce the background vehicle gallery to fewer tiles at lower opacity, increase whitespace and vertical rhythm, larger phone input, single primary CTA.
- OTP screen: 6-box OTP input with auto-advance, paste-fill, Web OTP API auto-detection where the browser supports it, 30s resend countdown then a "Resend OTP" action, spinner + disabled Verify while the request is in flight, and "Demo OTP" text hidden unless a dev flag is on.
- Replace "Forgot password" affordances with "Trouble receiving OTP?" and "Change mobile number".

## Phase 2 — Design system foundation (items 20, 21, 22, 23, 11)

- Tune `src/styles.css` tokens: slightly deepened, less neon primary orange; consistent neutral greys; card radius 24px; standard spacing scale.
- Type scale utility set (display / title / body / caption) with bold–semibold–medium–regular usage rules; apply across customer screens.
- Bottom nav: orange icon **and** orange label when active, plus a subtle pill/indicator, with a fast scale transition.
- Shared motion utilities (fade, slide, scale, card press) kept short (120–220ms).

## Phase 3 — Core screens (items 6, 7, 8, 9, 10, 12, 13, 18)

- Vehicle management: add **Delete Vehicle** beside Edit, with a confirmation dialog; disabled with a tooltip/help text when only one vehicle exists. Deletion uses the existing vehicle mutation path.
- Home header: greeting by time of day + name, notification bell with unread badge, support icon, subscription status chip ("18 days remaining"); location and vehicle switcher stay where they are.
- Subscription card: large price typography with a smaller `/month`, "Best Value" highlight, roomier spacing.
- One-time services: group into Exterior Care / Interior Care / Deep Cleaning / Polishing / Maintenance, rendered as collapsible sections driven by a category mapping derived from existing service data (no schema change).
- Service card: title, one-line description, duration, price, chevron, optional single badge (Popular / Recommended / Fast / Premium).
- Empty states with illustration + CTA for no vehicle, no booking, no subscription, no notifications.
- Skeleton shimmer loaders for vehicle, services, subscription and bookings lists — no blank screens.
- Pull-to-refresh on Home, Bookings, Profile (touch-driven, invalidates the relevant queries).

## Phase 4 — Flows and secondary screens (items 14, 15, 16, 17, 19)

- Booking flow: persistent step indicator (Vehicle → Date → Time → Payment → Confirmation) so the user always sees where they are. Step order and payment calls are unchanged.
- Booking success page replacing the toast: success animation, "Booking Confirmed", booking ID, "View Booking" and "Go Home".
- Customer Notification Center listing offers, booking updates, partner accepted/arrived, service completed, subscription expiry, with unread badge and read-marking through the existing notification tables.
- Profile: Edit Profile, My Vehicles, Saved Addresses, Support, FAQs, Refer & Earn, Privacy Policy, Terms, Delete Account, Logout — reusing existing routes where they exist, adding static content pages where they don't.
- Button states: shared async button behaviour (loading spinner, disabled while pending, success/failure feedback) applied to every mutating action to block double taps.

## Phase 5 — Logo, performance and QA (items 24, 25, 26)

- Logo: swap the current `logo.jpeg` references for the finalised UW mark across splash, login, toolbar and notifications; Android launcher/splash assets already flow from `android-branding/` and get refreshed from the same source. **I need the final UW logo file before this step** — otherwise Phase 5 ships with the current asset.
- Performance: memoise heavy list rows, lazy/`decoding=async` images, stable query keys to cut re-renders, defer non-critical work off the first paint.
- QA pass driven through the live preview: login, OTP, logout, auto-login, vehicle CRUD incl. delete, booking, payment entry, notifications, home, profile — checking for console errors, blank screens, overflow, dead links.

## Technical notes

- All colour/spacing/radius changes go through `src/styles.css` tokens, not hardcoded utilities.
- New shared pieces: `SkeletonCard`, `EmptyState`, `AsyncButton`, `StepIndicator`, `PullToRefresh`, `OtpInput`, `ServiceCategoryGroup`.
- Vehicle delete uses the existing customer vehicle mutation surface with the current RLS rules; if no delete path exists client-side, it is added as a soft-delete/deactivate matching whatever the current schema supports — no new columns.
- Partner routes under `/app` and `_authenticated` are not modified beyond shared design tokens.

## Open questions

1. Do you have the final UW logo file to hand, or should I polish everything else now and swap the logo in a follow-up?
2. Should "Saved Addresses" be a full CRUD screen, or read-only display of the current service address?
