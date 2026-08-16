# Plan: Partner App Home UI/UX Refinement

Refine the Partner App Home screen and global navigation to achieve a premium, professional operational aesthetic while prioritizing information clarity for field partners.

## Visual Direction
- **Palette**: Urban Wash Orange (#FF6B00), Black (#1A1A1A), White (#FFFFFF), Emerald Green for Online status.
- **Navigation**: Clean, compact, 70px height, equal-width items, no oversized elements.
- **Information Hierarchy**: Clear "Daily" vs "Monthly" earning distinction, simplified assignment progress, professional iconography over informal emojis.

## Proposed Changes

### 1. Global Navigation (`PartnerShell.tsx`)
- Update labels: "Available" -> "Available Work".
- Enforce single-line labels at 11-12px.
- Shrink icons to 24px (from current mixed sizes).
- Standardize height at 70px + safe area.
- Style active state with Urban Wash Orange and `font-bold` (no oversized circle/shadow).
- Ensure equal item width and proper safe-area padding.

### 2. Home Screen Header & Status (`app.index.tsx`)
- Redesign "System Online" card: Compact, subtle emerald/neutral background, clear status indicator, easy-to-use switch.
- Professionalize "Work Area" card: Subtle borders, clean typography.

### 3. Hero Assignment Card (`app.index.tsx`)
- Remove duplicate "₹" symbols (change `₹ ₹272` to `₹272`).
- Replace 🚗 emoji with professional `Car` icon from Lucide.
- Enforce the **₹Daily × 26 = ₹Monthly** rule (Mondays Off).
- Restructure hierarchy:
    - CUSTOMERS (Total count)
    - TOTAL DAILY EARNING (₹Amount / Day)
    - MONTHLY EARNING (₹Amount / Month)
    - START TIME (Simple 12h format)
    - PROGRESS (X / Y Completed)

### 4. Progress & Summary Cards (`app.index.tsx`)
- Standardize 3-column "Earning Summary" cards: Compact, consistent heights, bold numbers.
- Redesign "Start Assignment" CTA: Primary Orange, rounded shape, clear arrow, ensured visibility above bottom nav.

### 5. Support & Footer
- Refine "Partner Support" card: Compact layout, circular icon buttons for Phone/WhatsApp.
- Add bottom padding to Home container to prevent content overlap with fixed navigation.

### 6. Dynamic Pricing & Data Consistency
- Audit `app.assignments.tsx`, `MarketplaceOfferCard.tsx`, and `app.earnings.tsx` to ensure all "Monthly" calculations strictly use the 26-day rule.
- Ensure all "Available Work" previews represent the *total* earning for the shown customer count, not a per-customer average.

## Technical Details
- **Architecture**: No business logic changes. Reuse existing hooks (`useTodayAssignment`, `usePartner`).
- **Styling**: Tailwind CSS v4 variables and semantic tokens.
- **Responsiveness**: Use relative units and flexbox to handle small screens (Galaxy A04e) and large ones.
- **Consistency**: Unified `PartnerShell` across all partner routes.
