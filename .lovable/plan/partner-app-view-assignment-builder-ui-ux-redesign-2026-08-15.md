# Partner App — View Assignment & Builder UI/UX Redesign

Redesign the Partner App's assignment builder and view screens to be simple, premium, and action-oriented for field partners. The redesign focuses on clarity, readability, and information priority while preserving all existing business logic and calculations.

## User-Facing Changes

### 1. Header & Navigation Overhaul
- **Simplified Header**: Replaced "Build your assignment" with "Today's Assignment" and "Your work plan for today".
- **Compact Bottom Nav**: Fixed the partner bottom navigation to be compact (70px), premium, and safe-area aware, consistent with the Customer App.
- **Area Selection**: Prominently display the selected area with a "Select Work Area" button if not set.

### 2. Premium Hero Summary Card
- **Impactful Summary**: A large, premium card at the top showing:
    - Customer Count (e.g., 🚗 24 CUSTOMERS)
    - Monthly Earning (e.g., 💰 ₹10,608 / MONTH)
    - Location (📍 Area Name)
    - Timeline (🕕 6:00 AM → 10:00 AM)
    - Daily Hours (4 HOURS / DAY)
- **Calculation Clarity**: Explicitly state "26 service days/month • Mondays OFF".

### 3. Simplified Earnings & Calculations
- **Total Monthly Earning**: Focus on the total monthly income rather than confusing per-customer rates.
- **Transparent Logic**: Show exactly how the number is calculated (e.g., "24 customers × ₹17 × 26 service days").
- **Real-time Updates**: Monthly earning potential updates instantly as sliders move.

### 4. Better Sliders & Controls
- **Working Hours**: Interactive 2–6 hours/day slider with a visual timeline (🌅 6:00 AM ━━━━●━━━ 🌤️ 10:00 AM).
- **Commitment Days**: 7–30 days slider with clear communication that Mondays are always OFF.
- **Target Communication**: Move away from "0/24" labels to "5 customers ready" and "Today's target: 24".

### 5. Clear Primary Actions
- **Context-Aware CTA**: The main button text changes based on state (e.g., "START WITH 5 CUSTOMERS", "NO CUSTOMERS AVAILABLE").
- **Direct Cancellation**: A secondary but obvious "Cancel Assignment" option with a clear warning about releasing customers to the marketplace.

## Technical Details

### UI/UX Refactor
- **Component**: Update `src/routes/_authenticated/app.assignments.tsx` with new layout structure.
- **Component**: Update `src/components/partner/PartnerShell.tsx` for the compact 70px navigation.
- **Component**: Refactor `src/routes/_authenticated/app.my-assignment.tsx` to match the new "Today's Assignment" design language.
- **Styling**: Use a palette of Urban Wash Orange (primary actions), Black/Charcoal (headings/numbers), and Light Cream (background).

### Preserved Logic
- All existing `preview_assignment` and `accept_assignment_v2` RPC calls.
- The `SERVICE_DAYS_PER_MONTH = 26` business rule.
- Monday OFF scheduling logic.
- Assignment cancellation and marketplace redistribution flow.
- Parallel FCM dispatch for area partners.

### Constraints
- Mobile-first design for 360–430px screens.
- Zero breakage of existing partner state machine or database transactions.
