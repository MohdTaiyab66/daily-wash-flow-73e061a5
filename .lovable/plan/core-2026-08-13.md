---
name: Push Notification Forensic Fix
description: Use the proven Direct FCM path for all service-related notifications to ensure delivery consistency.
type: feature
---

## Core
Reuse the proven Direct FCM implementation for all service events.
No new FCM implementations. Direct send functions only.
Standardize on the `assignments_v4` channel for high-importance notifications.

## Facts
Direct Test Push works (Auth -> FCM -> Android).
`service_completed` events resolve the user but fail in delivery or native routing.
`assignments_v4` is the high-importance channel in native Kotlin.

## Workflow
1. Identify the exact send logic that makes Direct Test Push work.
2. Inject that logic directly into the service completion handler for a physical E2E test.
3. Verify the physical receipt on the customer phone.
4. Replace the dispatcher's send logic with the proven one.
