# Push Notification Forensic & Fix Plan

We will isolate why `service_completed` push notifications are not reaching the customer's phone despite tokens being registered. We will follow the 10-checkpoint trace plan and fix the first failure point.

## Checkpoints & Instrumentation

1.  **Standardize Channel IDs**: Align all customer-facing high-importance notifications to `assignments_v4`.
2.  **Fix Diagnostic Test**: Update the direct test push to use `assignments_v4` and include required identifiers (`broadcast_id`, `action_token`, `offer_id`) to ensure it follows the same path as real notifications.
3.  **Refine Forensic Labels**: Byte-perfect alignment of logs with the user's requested markers `[CUSTOMER-E2E:01-11]`.
4.  **Minimal Payload (Checkpoint 9)**: Simplify the FCM payload for `service_completed` to ensure delivery isn't blocked by optional fields.
5.  **Audit `p_customer_id` Resolution**: Verify that the database RPCs resolve the correct `user_id` for notifications.

## Technical Tasks

### 1. Unified Channel Configuration
- Update `src/lib/push/diagnostics.functions.ts` to use `assignments_v4`.
- Update `src/lib/push/dispatch.server.ts` to ensure `headsUp` types use `assignments_v4`.

### 2. Forensic Logging Alignment
- Edit `src/lib/push/send.server.ts` to use `[CUSTOMER-E2E:09-TOKEN]`, `[CUSTOMER-E2E:10-FCM]`, and `[CUSTOMER-E2E:11-FCM]`.
- Edit `src/lib/push/dispatch.server.ts` to use `[CUSTOMER-E2E:04-05]` and `[CUSTOMER-E2E:08]`.

### 3. Payload Simplification
- Modify `dispatchCustomerNotifications` in `src/lib/push/dispatch.server.ts` to send a flattened, string-only data payload.

### 4. Verification
- Create a test script `/tmp/trigger_test_push.ts` that invokes the server-side dispatch logic for a specific notification ID and captures the *exact* response from FCM.
