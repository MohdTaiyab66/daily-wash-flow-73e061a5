# Plan: Improve Partner New-Booking Push with Earnings + Distance

Improve the partner notification UX by providing real-time resolved earnings and distance for each eligible partner, ensuring accuracy and motivation.

## User Review Required

> [!IMPORTANT]
> - I will be creating a new file `src/lib/push/resolvers.server.ts` to host the canonical server-side logic for earnings and distance.
> - I will modify `src/lib/push/dispatch.server.ts` and `src/routes/api/public/cron/marketplace-push-dispatch.ts` to use these resolvers.

- **Earnings Rule**: I am using the `incentive` field from the marketplace offer as the partner's earnings for that specific booking. If there's a more complex base payout, I will integrate it into the resolver.
- **Distance Rule**: I will prioritize the partner's last known GPS location from `partner_availability` or `attendance`, falling back to their `home_zone_id` centroid if available.

## Proposed Changes

### Logic & Resolvers
#### [NEW] `src/lib/push/resolvers.server.ts`
- Implement `resolvePartnerBookingEarning` using the marketplace incentive.
- Implement `resolvePartnerBookingDistance` using partner location (GPS/Zone) vs Customer location (Booking coordinates).
- Add forensic logging with `[PARTNER-BOOKING-CONTEXT:*]` markers.

### Push Dispatch
#### [EDIT] `src/lib/push/dispatch.server.ts`
- Update `dispatchPendingOffers` to call resolvers for each partner.
- Enrich the FCM payload with `earning_display`, `distance_display`, and vehicle/area details.
- Optimize notification structure for Android heads-up visibility.

#### [EDIT] `src/lib/routes/api/public/cron/marketplace-push-dispatch.ts`
- Synchronize with the improved payload structure and resolvers.
- Ensure parallel fan-out remains stable with partner-specific payloads.

### Partner UI
#### [EDIT] `src/components/partner/AssignmentOfferDetail.tsx` (or similar)
- Ensure the assignment detail screen displays the same distance and earnings as the push notification by using the same resolver logic/data source.

## Verification Plan

### Automated Tests
- Run `dispatchPendingOffers` with mock data and verify logs for `EARNING_RESOLVED` and `DISTANCE_RESOLVED`.
- Verify the FCM payload structure matches the requirement.

### Manual Verification
- Create a booking in a test area (e.g., Lucknow).
- Check server logs for `[PARTNER-BOOKING-CONTEXT:01-04]`.
- Verify that two different partners in the same zone get different distance strings based on their location.
- Confirm the push notification title/body matches the "Preferred structure".
