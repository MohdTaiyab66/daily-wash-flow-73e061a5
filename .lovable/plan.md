# Simplified "Start Service" Workflow Plan

Redesign the Urban Wash Partner App's service-start flow to be a one-step action. Tapping "START" on the Daily Route page will immediately mark the service as "IN PROGRESS" without mandatory intermediate screens.

## Technical Details

### Frontend Changes

- **src/routes/_authenticated/app.live.tsx**:
    - Add a `startService` mutation using `useMutation` to handle immediate status updates.
    - Update `NextCustomerHero` and `CustomerDetailSheet`: replace the "Start Service" link to the detail page with a button that triggers the immediate `startService` mutation.
    - Handle state changes: When a service is "IN PROGRESS", show the "SERVICE IN PROGRESS" status and a link to the service workflow page (Resume).

- **src/routes/_authenticated/app.service.$id.tsx**:
    - Overhaul the rendering logic to remove mandatory "arrival", "found", and "condition" screens.
    - Set the default operational screen to "cleaning" (active service screen).
    - Move "Before Photo" and "Vehicle Condition" reporting to optional sections within the "cleaning" or a new "in_progress" UI.
    - Keep "Before Photo" requirement for completion if business rules require it, but do not block the start.

### Data & State Logic

- Ensure `service_started_at` and partner location (GPS) are recorded automatically when the one-tap START is triggered.
- Maintain atomic state transitions: `assigned` -> `in_progress` -> `completed`.

### User Interface

- **Daily Route Card (Started state)**:
    - Display "SERVICE IN PROGRESS" badge.
    - Show "Started at [Time]".
    - Change button from "START" to "SERVICE IN PROGRESS" (leads to workflow).
- **Active Service Page**:
    - Clean layout showing Customer, Vehicle, and Navigation/Call.
    - "SERVICE TASKS" section for optional Before Photo and Condition Report.
    - "SERVICE ACTION" section for "COMPLETE SERVICE".

## Operational Flow

```text
DAILY ROUTE
    ↓
NEXT STOP Card
    ↓
[ START ] (One Tap)
    ↓
Backend: status='in_progress', started_at=NOW, location=GPS
    ↓
UI: SERVICE IN PROGRESS
    ↓
Partner taps Card/Resume
    ↓
ACTIVE SERVICE SCREEN (Tasks: Photo, Condition | Action: Complete)
```
