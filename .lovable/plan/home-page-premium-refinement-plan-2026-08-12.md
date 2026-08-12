# Home Page Premium Refinement Plan

Refine the Urban Wash Home page into a lightweight, compact, and premium consumer mobile app experience.

## Overall Visual Direction
- Reduce visual scale by 8–15% while maintaining readability.
- Use strategic whitespace and subtle contrast instead of bold typography.
- Shift brand orange usage to an accent (prices, selection, important CTAs).

## Proposed Changes

### Top Header (`UWHeader.tsx`)
- Reduce vertical padding and header height.
- Set location and vehicle text to 16–18px (font-weight 500-600).
- Scale location icon to 20–21px and vehicle icon to 20–22px.
- Maintain soft rounded selector appearance.

### Home Carousel (`UWFeaturedCarousel.tsx`)
- Keep existing size and 150px height.
- Ensure it feels like a premium promotional banner rather than a giant hero.

### Our Services Section (`home.tsx`)
- Change "OUR SERVICES" to "Our Services" (22–24px, 600 weight).
- Reduce vertical spacing between carousel and heading to ~24px.

### Category Tabs (`home.tsx`)
- Reduce height to 48–52px.
- Set text to 15–16px (500-600 weight).
- Use a softer orange for the selected tab and a subtle neutral border for unselected.
- Significantly reduce shadows to feel like modern filter chips.

### Service Cards (`UWServiceCard.tsx`)
- **Compact Layout**: Maintain 3-column grid but reduce overall card height by 15-20%.
- **Images**: Reduce image area height by ~15% to prevent it from dominating.
- **Typography**: Set titles to 15–16px (600 weight) with max 2-line intelligent wrapping.
- **Duration**: 13–14px (400-500 weight) in muted gray.
- **Pricing**: 18–20px (600 weight) in brand orange. Ensure full visibility without clipping (responsive layout with "+" button).
- **Add Button**: Reduce "+" button to 44–48px diameter with a soft peach background.
- **Internal Spacing**: Tighten internal padding (12–14px) and element gaps.
- **Visuals**: Use very subtle borders and extremely soft shadows (Radius 18-20px).

### Service Grid (`home.tsx`)
- Standardize horizontal gaps (14–16px) and vertical gaps (16–18px).
- Apply identical compact design to all services (Buffing Polish, Roof Cleaning, etc.).
- Simplify displayed names (e.g., "Wash (No Body Polish)" instead of repeating "One-Time").

### Bottom Promotional Card (`home.tsx`)
- Reduce height to 100–115px.
- Heading: 11–12px uppercase orange.
- Main Text: 17–18px (600 weight).
- Compact CTA button.

### Bottom Navigation (`CustomerShell.tsx`)
- Maintain 68–72px height.
- Icons: 22–24px.
- Labels: 13–14px.
- Selected state: soft peach pill with orange icon/text.

## Technical Details
- Update `UWHeader.tsx` to handle responsive font sizes and padding.
- Refactor `UWServiceCard.tsx` props and styles for fixed height/compactness.
- Clean up `home.tsx` mapping logic to use concise customer-facing titles.
- Adjust Tailwind classes for light-weight typography (font-normal/medium/semibold).
