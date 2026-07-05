# Custom notification sound

Drop a short (~1s) `.mp3` or `.ogg` file here named `uw_offer.mp3`. The
patch script copies it into `android/app/src/main/res/raw/uw_offer.mp3` on
`cap sync`.

Suggested: two-tone rising chirp at ~880 Hz then 1320 Hz. Keep it under
40 KB. If you replace the file after install, bump the channel id in
`UrbanwashMessagingService.kt` (`offers_v2` → `offers_v3` …) — Android does
not update channel sound after creation.

If this file is missing, the channel falls back to the default notification
sound; the app still functions.
