# Plan: Dynamic Vehicle-Specific Daily Shine Pricing

Fix the issue where Daily Shine subscription pricing is static (₹1199) and ensure it dynamically resolves based on the selected vehicle's category.

## User Review Required

> [!IMPORTANT]
> The solution assumes `price_hatchback` and `price_sedan_suv` in `service_catalog` are the source of truth for all services, including Daily Shine subscriptions. If specific subscription pricing tiers exist elsewhere, please clarify.

## Proposed Changes

### Logic & Architecture
- **Pricing Source**: Use the `service_catalog` table's `price_hatchback` and `price_sedan_suv` columns for the specific subscription slug.
- **Vehicle Source**: Use the active vehicle's `category` from the `customer_vehicles` table (or local store) to select the correct price.
- **Cart Integration**: Update the `useCartStore` and `setBaseService` calls to ensure the resolved price is what gets added to the cart, preventing mismatches during checkout.

### Frontend Components
#### `src/routes/c/_authed/subscriptions.tsx`
- Replace hardcoded `1199` fallback with a dynamic lookup using `selectedVehicle.category`.
- Add diagnostic logging for `[DAILY-SHINE-PRICE]` during development.

#### `src/routes/c/_authed/home.tsx`
- Ensure the `priceFor` helper is applied consistently to all service cards.
- Ensure the Daily Shine banner/link passes the correctly resolved price to the next step.

#### `src/routes/c/_authed/service.$slug.tsx`
- Verify the `useEffect` that initializes the `baseService` in the cart correctly uses the vehicle's category-specific price from the `service` object.

#### `src/components/customer/BookAWashSheet.tsx`
- While this is for "Included Wash" (entitlement-based), ensure any "Buy More" links or price displays reflect the correct vehicle-specific rate.

### Backend / RPC
#### `confirm_customer_booking` (Supabase RPC)
- Ensure the backend calculates the amount based on `p_vehicle_id`'s category and `p_service_id`'s configuration, rather than trusting a frontend-provided total if possible (or validating the frontend total).

## Verification Plan

### Automated Tests (Playwright)
- Select **Maruti Alto** (Hatchback) -> Verify Daily Shine price is Hatchback rate (e.g., ₹999).
- Select **Hyundai Creta** (SUV) -> Verify Daily Shine price is SUV rate (e.g., ₹1199).
- Switch vehicle on Home -> Verify price updates instantly in the catalog and subscription view.
- Add to Cart -> Verify the Cart total matches the resolved vehicle price.
- Proceed to Payment -> Verify the Razorpay order amount matches the vehicle-specific price.

### Manual Verification
- Check console logs for `[DAILY-SHINE-PRICE]` trace details.
- Verify "Price unavailable" state if a vehicle has an unrecognized category.
