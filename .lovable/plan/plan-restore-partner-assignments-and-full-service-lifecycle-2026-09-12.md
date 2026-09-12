# Plan: Restore Partner Assignments and Full Service Lifecycle

Restore every partner’s active work, map locations, and service completion flow using one canonical partner identity and assignment source.

## Changes

### Authoritative partner work
- Replace the fragile booking-dependent `get_partner_work` join so an assignment’s services remain visible even when a booking link is missing or historical.
- Return all fields the Partner App needs directly: service and assignment IDs, customer/vehicle details, status, sequence, reason, address, and best available coordinates.
- Resolve the signed-in account to canonical `partners.id` inside protected work and outcome functions; remove comparisons against raw login IDs.
- Keep all dates aligned to Asia/Kolkata and remove weekday-specific zeroing that hides real work.

### Home, Daily Route, and map
- Map the work response to one stable service shape consumed by Home and Daily Route.
- Use service destination coordinates first, then customer coordinates, then the customer’s selected/default address coordinates.
- Show assigned work even when some stops lack coordinates; only omit those stops from the map and display a clear location warning instead of “Loading sequence…”.
- Preserve last-known-good assignment data during refreshes so screens never flash blank.

### Service outcomes and notifications
- Route completed, unavailable, and dirty/Need Wash outcomes through the same protected server function.
- Enforce canonical ownership, required photos, status transitions, earnings/entitlements, and durable customer notification creation.
- Trigger immediate customer notification delivery after the database update, while keeping the saved notification as the reliable fallback.
- Fix progress queries and service-start authorization to use canonical partner identity.

## Verification

- Query all active assignments and confirm each returns its assigned services through the authoritative work function.
- Verify coordinate coverage and fallback behavior for active stops.
- Test Partner Home → Daily Route → map → start service → upload required photos → complete/unavailable/Need Wash.
- Confirm service status, evidence photos, earnings/entitlement effects, and customer notification records.
- Verify desktop and Android-sized Partner App views, then confirm the latest build is healthy.
