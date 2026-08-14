# Production Cleanup — Remove Forensic UI + Fix Notification UX

We are moving the Urban Wash Customer and Partner apps from forensic testing to production. This plan covers the removal of diagnostic UI and the implementation of a proper production notification experience.

## User Review Required

> [!IMPORTANT]
> - The forensic diagnostic components (`PushDiagnosticsPanel`, etc.) will be completely removed from the UI.
> - The underlying FCM/native infrastructure remains intact for production use.
> - In-app notification banners will be added to provide a premium, themed experience when notifications arrive while the app is open.
> - Notification centers in both apps will be refined to match the new design language.

## Proposed Changes

### 1. Forensic UI Removal
- **Home Screen (`src/routes/c/_authed/home.tsx`)**: Remove `PushDiagnosticsPanel` and the related forensic error comment block.
- **Root Route (`src/routes/__root.tsx`)**: Remove debug information from the `ErrorComponent`.
- **Diagnostics Panel (`src/components/customer/PushDiagnosticsPanel.tsx`)**: Delete this component.
- **Diagnostics Logic (`src/lib/push/diagnostics.functions.ts`)**: Delete these server functions (not needed for production).
- **Global Search**: Audit all files for FCM-P0 build markers, diagnostic strings, and `direct_test` UI controls.

### 2. In-App Notification UI
- **Notification Banner (`src/components/ui/notification-banner.tsx`)**: Create a new, premium component for in-app alerts.
    - Design: Clean white card, rounded corners, subtle shadow, Urban Wash orange accent.
    - Animation: Slide-down from top → stay → slide-up.
    - Logic: Triggered by a new global event emitted from `src/lib/push/fcm.ts` when a foreground notification is received.
- **Notification Listener (`src/lib/push/fcm.ts`)**:
    - Remove diagnostic logging/toasts.
    - Emit a `urbanwash:in-app-notification` event with a clean, user-friendly payload (mapped from internal event names).
    - Map internal types (e.g., `service_completed`) to friendly titles and bodies.

### 3. Notification Center Refinement
- **Customer Notifications (`src/routes/c/_authed/notifications.tsx`)**:
    - Standardize icons and styles.
    - Ensure clear title/body/date/time.
    - Verify deep-linking to correct service/booking pages.
- **Partner Notifications (`src/routes/_authenticated/app.notifications.tsx`)**:
    - Prioritize earnings display (`+₹XXX/month`) for new work and released assignments.
    - Ensure distance and area are clearly visible.

### 4. Payload Mapping (Kotlin + Server-side)
- Ensure the server-side dispatchers (`src/lib/push/dispatch.server.ts`) provide the necessary fields for the premium display (customer counts, monthly earnings, area names).
- Monthly earnings formula: `daily earning × 26 service days`.

## Technical Details

- **Event Mapping**: A lookup table will translate internal event names like `service_completed` into user-facing titles ("✓ Service Completed") and messages.
- **Earnings Logic**: Ensure `monthly_earnings` in the FCM data payload is pre-calculated on the server (26-day basis) so the app doesn't have to do it.
- **Toast Replacement**: Replace generic `sonner` toasts with the new `NotificationBanner` for FCM events to distinguish them from standard system messages.

## Acceptance Criteria

### Customer
- Home page has no forensic panel or build markers.
- Receive `service-started`, `service-completed`, etc., as premium in-app banners.
- Notification center shows clear, styled entries with functional deep links.

### Partner
- Home page has no forensic panel.
- Receive `new_booking` and `assignment_released` with prominent monthly earnings and distance.
- Notification center accurately reflects available opportunities with potential income.
