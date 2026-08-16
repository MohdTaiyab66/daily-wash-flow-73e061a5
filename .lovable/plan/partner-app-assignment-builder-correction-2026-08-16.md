# Partner App Assignment Builder Correction

Cleanup and functional correction of the "Build Your Assignment" page to fix calculation bugs, improve UI hierarchy, and refine the bottom navigation.

## Functional Changes
- Fix "Total Assignment Earning" calculation: `Daily Earning * Selected Commitment Days`.
- Implement two distinct earning models in the UI:
    - **Total Assignment Earning**: Specific to the selected commitment duration (7-30 days).
    - **Monthly Projection**: Based on the standard 26-day model.
- Ensure all values (Daily, Total, Monthly) update instantly when sliders move.
- Maintain existing business rules: ₹17 per car, 26 service days per month, Mondays off.

## UI/UX Improvements
- **Hierarchy Refinement**:
    - Header -> Work Area -> Hours Slider -> Days Slider -> Earning Card -> CTA.
- **Earning Card Redesign**:
    - Prominent Daily Earning.
    - Clear Total Assignment Earning (e.g., "TOTAL FOR 16 DAYS").
    - Transparent Monthly Projection with service day details.
- **Slider Enhancements**:
    - Clearer labels: "HOW MANY DAYS DO YOU WANT TO COMMIT?".
    - Real-time feedback for working hours (6:30 AM → 10:30 AM).
- **Navigation & Layout**:
    - Fix Partner bottom navigation: "Available" label, 5 items, compact professional style.
    - Ensure sticky CTA does not overlap footer.
    - Remove duplicate info and excessive spacing.
    - Handle Android safe areas and prevent horizontal overflow.

## Technical Details
- Centralize calculation logic in `src/routes/_authenticated/app.assignments.tsx`.
- Update `PartnerShell.tsx` to ensure consistent bottom navigation styling and padding.
- Use `shadcn/ui` components for sliders and cards with Urban Wash branding.
- Verify calculations: 4 hours = 24 cars = ₹408/day; 16 days = ₹6,528 total; 26 days = ₹10,608 monthly.
