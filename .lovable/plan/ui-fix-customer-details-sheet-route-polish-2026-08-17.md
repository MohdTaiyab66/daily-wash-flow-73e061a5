# UI Fix: Customer Details Sheet & Route Polish

Redesign the Customer Details bottom sheet in the Partner app to fix broken layouts, invisible buttons, and improve the information hierarchy.

## User Review Required

> [!IMPORTANT]
> - The "Call Customer" button uses a masked calling service. If the icon/text is missing, it's usually due to style conflicts or invalid data in the `MaskedCallButton` component.
> - The "Start Service" action remains a one-step process as previously requested.

## Proposed Changes

### Partner App (Customer Details & Route)

#### `app.live.tsx` (Customer Details Sheet)
- **Fix Layout:** Resolve the "Blank Card" bug by auditing the `MaskedCallButton` and ensuring it properly handles the side-by-side layout with `Navigate`.
- **Button Redesign:**
  - `Navigate` and `Call Customer` will be rendered as side-by-side buttons with equal height (h-14), rounded corners (2xl), and visible icons/labels.
  - Implement a `flex: 1` or percentage-based width (approx 48% each) to prevent clipping on 360px Android screens.
- **Hierarchy Polish:**
  - Heading: "CUSTOMER DETAILS" in small black/orange caps.
  - Primary: Customer Name in large bold text.
  - Vehicle Card: Compact background card for Make, Model, and Registration.
  - Service Info: Compact grid for Time and Status with clear icons.
- **Primary CTA:** Urban Wash Orange "START SERVICE" button (full width, h-14).
- **Sheet Height:** Remove excessive whitespace by making the content area height-to-fit (max 90vh) and respecting safe areas.

#### `app.live.tsx` (Logic & Components)
- **MaskedCallButton Fix:** Audit `MaskedCallButton` styling to ensure `Phone` icon and text are visible with proper contrast (black/neutral on white/outline).
- **Data Validation:** Ensure `stop.customers.phone` and `stop.customers.full_name` are correctly passed and rendered.

## Technical Details
- Use `flex` and `gap-3` for the action row to ensure responsive fit.
- Apply `truncate` to long customer names or registration numbers to prevent layout breaking.
- Use `lucide-react` icons consistently (Navigation, Phone, Play).
- Maintain the `initiateMaskedCall` logic without modifications.
