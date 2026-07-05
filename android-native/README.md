# Urban Wash — Native Android Sources

These files are copied into `android/app/src/main/...` by
`scripts/patch-android-manifest.mjs` on every `npx cap sync android`.

They implement the Uber/Rapido-style marketplace offer notifications:

- `UrbanwashMessagingService.kt` — subclasses `FirebaseMessagingService`.
  When an FCM data message with `type=marketplace_offer` arrives, it posts a
  full-screen, MAX-importance notification with Accept / Decline actions and
  a `setFullScreenIntent(...)` so the notification wakes the screen and
  shows over the lock screen — exactly like a ride request.
- `OfferActionReceiver.kt` — the `BroadcastReceiver` invoked when the
  partner taps Accept or Decline in the notification. It calls
  `POST /api/public/marketplace/offer-action` with the signed `action_token`
  from the FCM data payload, then dismisses the notification. No app open
  required.
- `res/raw/uw_offer.mp3` — the custom marketplace sound. Ship any short
  ~1s tone here; the file MUST be named `uw_offer.mp3` (or update
  `notification_sound` in `marketplace_settings`).

## Manifest wiring

The patch script adds:

- Permissions: `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `VIBRATE`,
  `POST_NOTIFICATIONS`.
- Service: `com.urbanwash.push.UrbanwashMessagingService` handling
  `com.google.firebase.MESSAGING_EVENT`.
- Receiver: `com.urbanwash.push.OfferActionReceiver` (not exported).

## Custom sound

Android bakes channel sound at channel-creation time. If you change the
sound file, bump the channel id (`offers_v2`, `offers_v3`, …) in both the
Kotlin service and `src/lib/push/fcm.ts`.

## Verification

Native behavior can only be verified on a real device. Build with
`bun run build && URBANWASH_APP=partner npx cap sync android && npx cap open android`,
install the APK, lock the phone, and trigger a marketplace broadcast.
