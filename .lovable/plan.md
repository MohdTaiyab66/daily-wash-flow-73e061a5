# Partner Assignment Builder & Bottom Nav Refinement

Refine the Partner App's assignment builder to clearly distinguish between commitment duration and monthly earnings, improve visual communication of working hours, and fix bottom navigation clipping.

## User-Facing Changes

### Assignment Builder (State 1: No Active Assignment)
- **Terminology Update**: Change "HOW MANY DAYS DO YOU WANT TO WORK?" to "HOW MANY DAYS DO YOU WANT TO COMMIT?".
- **Slider Clarification**: Explicitly state that the commitment slider controls the assignment duration, while monthly earnings are projected based on 26 service days.
- **Hours Visuals**: Add live indicators for "6:30 AM → 10:30 AM" directly above/below the hours slider with more prominent labels.
- **Live Plan Summary**: Add a compact "YOUR PLAN" summary section showing Area, Hours, Target, and Commitment before the earnings card.
- **Earnings Detail**: Show the "₹17 / CUSTOMER / DAY" breakdown to explain where earnings come from.
- **Zero-Customer Handling**: Maintain the "BUILD" UI even if 0 customers are available, showing "0 CUSTOMERS AVAILABLE RIGHT NOW" with a supportive message.
- **Primary CTA**: Ensure "START MY ASSIGNMENT →" is the single dominant action and never overlaps the footer.

### Bottom Navigation
- **Label Fix**: Standardize labels to prevent clipping (Home, Available, Earnings, Rewards, Profile).
- **Layout**: Ensure equal-width items and proper safe-area insets for Android.

## Technical Details

### Calculation Logic (`src/routes/_authenticated/app.assignments.tsx`)
- **Strict Formula**: `Daily = Target * Rate`, `Monthly = Daily * 26`.
- **Decoupling**: Ensure `duration` (commitment slider) does NOT affect `monthlyEarn`.
- **Unified State**: Centralize calculations in a useMemo or at the top level to ensure all UI elements show consistent data.

### UI Components
- **Premium Sliders**: Enhance the `Slider` implementation with better value feedback and Urban Wash orange accents.
- **Layout Spacing**: Add `pb-[200px]` to the main container to ensure content scrolls above the fixed CTA and footer.
- **Fixed CTA Positioning**: Position the CTA container at `bottom-[70px]` to sit perfectly above the bottom nav.

### Bottom Nav (`src/components/partner/PartnerShell.tsx`)
- **Label Normalization**: Force "Available" label to prevent overflow.
- **Styling**: Apply glass effects and optimized active state accents.
