# Urban Wash Partner — Final UI Polish Plan

Visual overhaul of the Assignment Builder page to align with the premium black, white, and orange brand identity while ensuring perfect responsiveness on Android.

## UI Components Overhaul

### 1. Timing and Customer Target Cards
- Replace generic white cards with two side-by-side black cards.
- **Design**:
  - Background: `#1A1A1A` (deep black).
  - Border: Subtle charcoal.
  - Radius: `20px`.
  - Content:
    - **Working Hours**: Orange `Clock` icon, small uppercase muted gray label, white bold time range.
    - **Customer Target**: Orange `Car` icon, small uppercase muted gray label, white bold "XX CUSTOMERS" with orange number highlight.

### 2. Premium Earning Card
- Update the existing black card to a more refined premium design.
- **Structure**:
  - **Your Earning** header in muted gray uppercase.
  - **Daily Earning** section: ₹XXX / DAY (Orange value).
  - **Period Total**: "FOR YOUR XX-DAY ASSIGNMENT" with ₹X,XXX (White value).
  - **Service Info**: Emerald badge for "XX SERVICE DAYS" and small "Mondays off".

### 3. CTA & Navigation
- **Start My Assignment Button**:
  - Background: `#FF6B00` (Urban Wash Orange).
  - Text: White, bold, uppercase.
  - Separation: Arrow `→` slightly separated from text.
  - Radius: `24px`.
  - Height: `64px`.
- **Positioning**:
  - Fixed above the bottom nav.
  - Enhanced safe-area bottom padding (`pb-[calc(16px+env(safe-area-inset-bottom))]`).
- **Bottom Navigation**:
  - Ensure "AVAILABLE" fits on one line.
  - White background with subtle top border.
  - Selected state: Orange circle background for icon, black label.

### 4. Spacing and Typography
- Tighten vertical whitespace between sections (Titles, Sliders, Cards).
- Use a consistent scale: `8px`, `12px`, `16px`, `24px`.
- Bold black headings and Urban Wash orange for selected values.

## Technical Details

- **Responsive Grid**: Use `grid-cols-2` with `min-w-0` to prevent text clipping on 360px screens.
- **Button States**: Implement `active:scale-[0.98]` and `hover:bg-[#E56000]`.
- **Safe Area**: Verify `env(safe-area-inset-bottom)` is correctly applied to the fixed footer container.
- **Logic Preservation**: No changes to `countServiceDays`, `dailyEarn`, or `assignmentEarn` calculations.
