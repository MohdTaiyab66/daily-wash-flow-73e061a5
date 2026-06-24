# Guest-First Customer Flow

Make the entire discovery + booking flow usable without login. Login is only enforced at payment and a few sensitive actions (complaints, subscriptions, profile/history, save permanent address).

## Architecture changes

### 1. Move discovery routes out of `_authed/`
Currently all of `home`, `service.$slug`, `vehicles`, `vehicles_.add`, `subscriptions`, `bookings*`, `profile`, `referrals` live under `_authed/` (which forces login).

Reclassify:
- **Public (move out of `_authed/`)**: `home`, `service.$slug`, `vehicles`, `vehicles_.add` (works against guest cart), `subscriptions` (browse only — purchase gated).
- **Auth-required (stay in `_authed/`)**: `bookings`, `bookings.$id`, `profile`, `referrals`, complaint submission.

Implementation: rename files from `src/routes/c/_authed/<x>.tsx` → `src/routes/c/<x>.tsx`. Update `createFileRoute` strings (drop `/_authed`). Update internal `<Link to="/c/_authed/...">` references project-wide to `/c/...`.

The existing `src/routes/c/services.tsx` placeholder is replaced — the real public home becomes `/c/home`.

### 2. Guest session store
New `src/lib/guest-cart.ts`:
```ts
type GuestCart = {
  vehicle?: GuestVehicle;     // not yet persisted to DB
  serviceSlug?: string;
  addons?: string[];
  address?: GuestAddress;
  slot?: { date: string; window: string };
  area?: string;              // already in localStorage
};
```
- Backed by `localStorage` key `uw_guest_cart`.
- Tiny zustand-style hook `useGuestCart()` (plain `useSyncExternalStore`).
- Cleared after successful booking restore.

### 3. Login gate component
`src/components/customer/RequireAuth.tsx`:
- `useRequireAuth()` returns `(action: () => void) => void`.
- If user signed in → run action.
- Else → stash an "intent" into `localStorage` (`uw_pending_intent`) and `navigate({ to: '/c/welcome', search: { redirect: currentPath } })`.

Welcome screen reads `redirect` search param; after successful OTP it navigates back and the page can read the intent.

### 4. New checkout route
`src/routes/c/checkout.tsx` (public):
- Reads `guestCart`.
- Renders summary, vehicle, slot, address, total.
- "Proceed to Pay" button:
  - If signed in → call existing booking creation server fn → Razorpay (stub) → confirmation.
  - If guest → call `useRequireAuth(() => proceedToPay())`. After login, intent restores and pay continues.

Confirmation page: `src/routes/c/booking.confirmed.tsx`.

### 5. Welcome screen redirect handling
Update `src/routes/c/welcome.tsx`:
- Accept `?redirect=/c/checkout` search.
- After OTP/name complete → `navigate({ to: redirect ?? '/c/home' })`.
- Keep "Skip Login" → goes to `/c/location` only on first run; if location already set, → `/c/home`.

### 6. Splash → flow
Update `src/routes/c/index.tsx`:
- If logged in → `/c/home`.
- Else if `uw_area` set → `/c/home` (guest).
- Else → `/c/welcome`.

Welcome "Skip Login" → `/c/location` (unchanged) → `/c/home` (instead of `/c/services`).

### 7. Gate sensitive actions inside existing pages
Wrap these handlers with `useRequireAuth`:
- `home.tsx` profile icon / "My bookings" tile.
- `subscriptions.tsx` purchase button.
- `service.$slug.tsx` "Book now" → routes to `/c/checkout` (works for guest); "Save vehicle permanently" prompt → gated.
- Any complaint button.

Vehicle add page works on guest cart when not logged in (saves locally); when logged in, saves to DB as today.

## Files to create
- `src/lib/guest-cart.ts`
- `src/components/customer/RequireAuth.tsx`
- `src/routes/c/checkout.tsx`
- `src/routes/c/booking.confirmed.tsx`

## Files to move (rename)
- `src/routes/c/_authed/home.tsx` → `src/routes/c/home.tsx`
- `src/routes/c/_authed/service.$slug.tsx` → `src/routes/c/service.$slug.tsx`
- `src/routes/c/_authed/vehicles.tsx` → `src/routes/c/vehicles.tsx`
- `src/routes/c/_authed/vehicles_.add.tsx` → `src/routes/c/vehicles_.add.tsx`
- `src/routes/c/_authed/subscriptions.tsx` → `src/routes/c/subscriptions.tsx`

(Keep `bookings*`, `profile`, `referrals` under `_authed/`.)

## Files to edit
- `src/routes/c/index.tsx`, `welcome.tsx`, `location.tsx`, `location.search.tsx` — redirect chain.
- `src/components/customer/CustomerShell.tsx` — works for both guest and authed; bottom-nav items that require auth use `useRequireAuth`.
- Internal `Link to="/c/_authed/..."` references across `home.tsx`, `subscriptions.tsx`, `service.$slug.tsx`, `bookings*`, `profile`, etc. — search-replace.
- Delete `src/routes/c/services.tsx` (superseded by public `/c/home`).
- `src/routes/c/auth.tsx` redirect stays.

## Out of scope (not in this turn)
- Real Razorpay integration (stub button that pretends to succeed for now — flagged with TODO).
- Backend booking server fn changes — reuse what exists; if a needed createServerFn for guest→authed handoff is missing, add a thin `confirmBookingAfterAuth` fn that consumes the restored cart.

## Verification
- Build (auto).
- Hit `/c/` cold (no localStorage) → splash → welcome → skip → location → home renders services.
- From guest home: open a service → add vehicle (saved to guest cart) → /c/checkout → "Proceed to pay" → welcome with `?redirect=/c/checkout` → OTP `1234` → returns to checkout with cart intact.
- Logged-in user: skip OTP, go straight to pay.
