# Plan - Assignment Released Marketplace UX

## Overview
Complete the notification and marketplace UX for the assignment cancellation/release feature. When a partner cancels an unstarted assignment, the customers return to the marketplace, and all other eligible partners receive a high-priority notification with dynamic earnings and distance info.

## Technical Details

### Backend & Notifications
- **FCM Event Support**: Update `UrbanwashMessagingService.kt` to recognize `assignment_released` and `assignment_cancelled` events with native markers.
- **Payload Resolution**: Ensure `dispatchAssignmentReleased` in `dispatch.server.ts` calculates partner-specific monthly earnings and distance using canonical resolvers.
- **Parallel Fan-out**: Implement parallel FCM dispatch in `dispatchAssignmentReleased` for target 2-3s latency.
- **Reliability**: Add `assignment_released` and `assignment_cancelled` to `PARTNER_ASSIGNMENT_TYPES` in `dispatch.server.ts`.

### Marketplace UI
- **Data Enrichment**: Update `getPartnerOpenOffers` in `marketplace.functions.ts` to return released work metadata (type, customer count, monthly earnings, distance, assignment_id).
- **Offer Card**: Enhance `MarketplaceOfferCard.tsx` to handle `assignment_released` type, showing "NEW WORK AVAILABLE", customer counts, and monthly earnings visually prominently.
- **View Customers**: Implement a modal in `MarketplaceOffersList.tsx` that fetches individual released vehicle details via `getReleasedAssignmentCustomers`.
- **Atomic Claims**: Reuse existing `acceptMarketplaceOffer` logic for claiming released work, ensuring only one partner can claim.

### Forensic Logging
- **Markers**: Inject markers `[CANCEL-ASSIGNMENT:08-10]`, `[RELEASED-WORK-PUSH:01-06]`, and `[CUSTOMER-PUSH-NATIVE:03-05]`.
- **Visibility**: Ensure the marketplace card appears immediately via existing realtime channel invalidations.

## Verification Plan
1. **Cancellation**: Partner A cancels an assignment with 20 unstarted customers.
2. **Logs**: Verify `[CANCEL-ASSIGNMENT:08-10]` and `[RELEASED-WORK-PUSH:01-05]` in server logs.
3. **Notification**: Partner B receives FCM `assignment_released`. Verify `[CUSTOMER-PUSH-NATIVE:03-05]` in Android logs.
4. **UI**: Partner B sees "NEW WORK AVAILABLE" card with "+₹8,840/month" and "20 Customers".
5. **Detail**: Partner B taps "View Customers" and sees the vehicle list.
6. **Claim**: Partner B taps "Claim All Work". Verify assignment transferred and card disappears for others.
