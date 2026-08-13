# Plan - Fix Daily Shine Vehicle-Wise Pricing

Fix the production bug where Daily Shine subscription pricing incorrectly defaults to ₹1199 (SUV price) for Hatchbacks and Compact Sedans.

## Proposed Changes

### Logic Tier
- **Create `src/lib/pricing.ts`**: Centralize the Daily Shine price resolution logic.
- **Implement `resolveDailyShinePrice(category, serviceCatalogItem)`**:
  - `sedan_suv` -> ₹1199
  - `hatchback_compact_sedan` -> ₹999
  - Handle missing categories by returning a "pricing unavailable" state or a safe null (to be handled by UI).
  - Explicitly log mapping results with `[DAILY-SHINE-PRICE]` tag.

### UI Tier
- **Update `src/routes/c/_authed/home.tsx`**:
  - Replace inline ternary logic with the new resolver.
  - Pass the current active vehicle's category to the resolver.
- **Update `src/routes/c/_authed/subscriptions.tsx`**:
  - Replace ternary fallbacks with the centralized resolver.
  - Ensure the "My Plan" page correctly displays ₹999 for non-SUV vehicles.
- **Update `src/routes/c/_authed/service.$slug.tsx`**:
  - Refine the cart initialization logic to use the centralized resolver.
  - Ensure the `confirm_customer_booking` RPC flow receives the correct resolved price.

### Data Tier
- **Verify `customer_vehicles` integration**: Ensure the `category` field is correctly populated and passed through the `useSelectedVehicleId` hook.

## Technical Details

- **Category Mapping**:
  - `hatchback_compact_sedan` (Alto, Dzire, etc.) -> ₹999
  - `sedan_suv` (Creta, Seltos, etc.) -> ₹1199
- **Diagnostics**:
  - Temporary console logs during development to verify price resolution in all booking stages.
- **Verification**:
  - Playwright test script to simulate switching between an Alto and a Creta and checking the price propagation.

## User Review Required

> [!IMPORTANT]
> The fix assumes `hatchback_compact_sedan` and `sedan_suv` are the only two categories currently in use in the database for Daily Shine pricing. If new categories have been added recently, please let me know.
