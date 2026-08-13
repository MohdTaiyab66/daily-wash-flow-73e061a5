# Plan: Unify Real-Time Notifications & Payment Verification

Overhaul the notification pipeline for real-time delivery and enforce strict payment verification security.

## Notification Overhaul (P0-A, P0-B, P0-C)

- **One Canonical Pipeline**: Standardize the flow: Event → Record → Immediate Dispatch → Resolve Recipient/Tokens → FCM Send → Record Result → Retry failures.
- **Fan-Out (P0-C)**: Modify `dispatchPendingOffers` to resolve and send to ALL eligible area partners in parallel, ensuring one bad token doesn't block the batch.
- **Real-Time Dispatch**: Ensure every status update (Accept, Start, Complete, Unavailable, Dirty) triggers the immediate dispatch server function.
- **Event Matrix**: Standardize all customer/partner events (e.g., `booking_created`, `partner_accepted`, `vehicle_unavailable`) and ensure explicit mapping in the dispatcher to avoid `EVENT_UNKNOWN`.
- **Forensic Markers**: Add `[BOOKING-PUSH:01-09]` and `[UNAVAILABLE-PUSH:01-08]` markers to trace every step of the lifecycle.
- **Reliability**: Harder `sendOne` in `send.server.ts` with bounded retries and exponential backoff.

## Payment Verification (P0-D)

- **Verification Hardening**: Audit `verifyRazorpayPayment` and `razorpay-webhook` to ensure NO booking is activated without a verified provider signature and captured status.
- **Forensic Markers**: Add `[PAYMENT-E2E:01-06]` markers to trace the flow from order creation to server-side activation.
- **Idempotency**: Ensure both webhook and client-side verification converge on the same state without creating duplicate records.
- **UX Improvement**: Replace generic failure messages with "Payment is being verified" for transient timeouts while re-verifying server-side.

## Technical Details

- **Files**: `src/lib/push/dispatch.server.ts`, `src/lib/push/send.server.ts`, `src/lib/push/immediate.functions.ts`, `src/lib/payment.functions.ts`, `src/routes/api/public/razorpay-webhook.ts`.
- **Database**: Enforce `GRANT` and RLS on `payment_attempts` and `notification` tables.
- **Forensics**: Markers use `console.log` for immediate visibility in logs during E2E physical testing.
