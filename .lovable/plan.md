# Subscription payment reliability — end‑to‑end

Cover both Razorpay code paths in E2E, make the client resilient when the checkout window doesn't return cleanly, surface failures inline with a Retry button, and log every attempt so admin can debug quickly.

## 1. Backend attempt log

Add a new table `payment_attempts` (schema change → migration):

```text
id              uuid pk
booking_id      uuid (fk bookings)
user_id         uuid (fk auth.users)
provider        text default 'razorpay'
provider_order_id text
provider_payment_id text
channel         text  -- 'native' | 'web'
outcome         text  -- 'started' | 'success' | 'failure' | 'cancelled' | 'retry' | 'timeout'
attempt_no      int   -- 1..N per booking
error_code      text
error_message   text
metadata        jsonb
created_at      timestamptz default now()
```

GRANTs: `authenticated` insert/select on own rows, `service_role` all. RLS: user sees own rows (`auth.uid() = user_id`); admin sees all via `has_role(auth.uid(),'admin')`.

New server functions in `src/lib/payment.functions.ts`:

- `logPaymentAttempt({ bookingId, channel, outcome, errorMessage?, errorCode?, providerPaymentId?, metadata? })` — authenticated, inserts a row and returns `{ attemptNo }`.
- `getBookingPaymentStatus({ bookingId })` — authenticated, returns `{ status, subscriptionId?, latestAttempt? }` by joining `bookings.payment_status`, `payments`, and latest `payment_attempts` row for the caller's booking. Used by client polling.

`verifyRazorpayPayment` also writes a `success` attempt row on capture and a `failure` row on thrown errors (best-effort, non-fatal).

## 2. Client checkout flow (`src/routes/c/_authed/service.$slug.tsx`)

- Track `attemptNo` per booking in component state.
- Before opening checkout, call `logPaymentAttempt({ outcome: 'started', channel })`.
- Native branch: on capture success → `success`; on plugin unavailable → log `failure` with `error_code: 'plugin_unimplemented'` and fall through to web (existing behavior).
- Web branch: `payment.failed` → `failure`; `ondismiss` → `cancelled`.
- After **either** branch resolves OR throws, run **status polling** via `getBookingPaymentStatus` for up to 60s (2s interval). If it returns `paid` even though the client threw (e.g. redirect swallowed but webhook already reconciled), treat as success and navigate. This is the "reliable reflection even if Razorpay redirect doesn't return cleanly" piece.
- Replace the current `throw new Error(...)` UX with:
  - `paymentError` state (`{ message, canRetry }`).
  - Inline `<Alert role="alert" data-testid="payment-error-banner">` above the Pay button with **Retry checkout** and **Dismiss** actions.
  - Retry re‑runs the same flow, incrementing `attemptNo` and logging `retry`.

## 3. E2E test additions (`scripts/test-subscription-payment-e2e.mjs`, new)

Runs against local Vite. Skips gracefully when auth is not injected.

Scenarios:

1. **Native path** — inject a fake `capacitor-razorpay` module (via `window.Capacitor.Plugins.Checkout = { open: async () => ({ response: { razorpay_payment_id, razorpay_order_id, razorpay_signature } }) }` mock) and stub `isNative()` by setting `window.__UW_FORCE_NATIVE = true`, which `platform.ts` will respect in dev. Route `**/api.razorpay.com/**` and the `verifyRazorpayPayment` RPC to succeed. Assert redirect to `/c/subscriptions` and no error banner.
2. **Web fallback path** — force native to throw "not implemented" from the mock; assert `loadRazorpayCheckout` runs, stub `window.Razorpay` to invoke `handler(...)` synchronously with a fake response; assert same success outcome and that a `payment_attempts` row with `channel='web'` was recorded via `getBookingPaymentStatus`.
3. **Failure + retry banner** — force `verifyRazorpayPayment` route to 500. Assert `data-testid="payment-error-banner"` renders, contains the error text, and shows a **Retry checkout** button. Click Retry with the failure route removed → success. Assert banner clears.
4. **Redirect‑lost polling** — make the web checkout `ondismiss` fire (no response), but have the server return `payment_status='paid'` on the next `getBookingPaymentStatus` poll. Assert the app still navigates to `/c/subscriptions` and shows the success toast.

## 4. Admin visibility

Add a small `PaymentAttemptsSection` to `src/routes/admin.customers.$id.tsx` (already renders per‑customer detail) showing the last 20 rows from `payment_attempts` for that user, columns: created_at, booking, channel, outcome, error. Read via a new `getUserPaymentAttempts` server function guarded by `has_role(...,'admin')`.

## Technical details

- `platform.ts`: honor `window.__UW_FORCE_NATIVE === true` OR `__UW_FORCE_WEB === true` in `isNative()` — dev/E2E only, gated by `import.meta.env.DEV`.
- Polling uses `setInterval`; cancels on unmount, on success, and on user pressing Retry.
- `logPaymentAttempt` is wrapped in `try/catch` at every call site — logging must never break checkout.
- No changes to Razorpay webhook (`api/public/razorpay-webhook.ts`); it already reconciles via `activate_paid_booking`, which is what polling detects.
- Migration adds indexes on `(booking_id, created_at desc)` and `(user_id, created_at desc)`.

## Files

- `supabase/migrations/<ts>_payment_attempts.sql` (new)
- `src/lib/payment.functions.ts` (extend)
- `src/routes/c/_authed/service.$slug.tsx` (banner + polling + attempt logging + retry)
- `src/lib/platform.ts` (dev-only force flags)
- `src/routes/admin.customers.$id.tsx` (attempts section)
- `scripts/test-subscription-payment-e2e.mjs` (new)
