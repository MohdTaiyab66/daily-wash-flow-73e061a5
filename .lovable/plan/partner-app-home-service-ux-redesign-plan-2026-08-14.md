# Partner App Home + Service UX Redesign Plan

Redesign the Partner App Home screen to reduce cognitive overload and focus on the primary task (Online/Offline, Assignment, Next Action).

## Proposed Changes

### 1. Home Screen Hierarchy & States (`src/routes/_authenticated/app.index.tsx`)
- Implement a state-driven layout based on the partner's current status:
    - **State 1: New Partner / No Assignment** (Online/Offline + "Waiting for work" card).
    - **State 2: Assignment Available** (Summary card with customer count, earnings, distance).
    - **State 3: Service In Progress** (Compact "Current Service" card).
    - **State 4: All Services Completed** (Celebration card + summary).
- Unified Header: Clean, minimalist header with notification bell and language switch.
- Simplified Availability Toggle: Prominent Online/Offline state immediately under the header.
- Today's Earnings: Compact stats row (₹ Earned, # Completed) instead of large potential cards.
- Remove marketing noise: De-emphasize/move "Community", "Journey", and secondary benefit chips.

### 2. Layout & Shell (`src/routes/_authenticated/app.tsx`)
- Move Global Header logic to `app.index.tsx` for state-specific headers, or refine `TopBar` to be cleaner as requested.
- Ensure `BottomNav` highlights the active tab clearly with the new palette (Black/Orange/White).

### 3. Service Workflow UX
- Refine `MarketplaceOffersList` integration on the Home screen for the "Available Work" state.
- Ensure the "Next Action" CTA is always obvious and singular.

## Technical Details
- Use existing `useTodayAssignment` hook for all state transitions.
- Maintain existing business logic for assignments, marketplace, and earnings.
- Tailwind CSS for all styling (Black, Orange #FF6B00, White palette).
- Lucide React for iconography.

## User Review Required
- Should the "Create Today's Route" CTA be entirely replaced by the "No assignment yet" state for partners without an assignment?
- Confirming that "Marketplace" should be labeled as "Available Work" in the UI.
