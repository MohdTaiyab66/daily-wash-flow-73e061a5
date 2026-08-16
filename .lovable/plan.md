# Plan: Daily Route Header Cleanup

Clean up the Daily Route page (`src/routes/_authenticated/app.live.tsx`) to remove duplicate branding and standardize the header hierarchy for a professional, operational experience.

## User Review Required
> [!IMPORTANT]
> - The global app header (Logo + "URBAN WASH Partner" + Notifications + Language) will remain at the very top.
> - The duplicate "URBAN WASH Partner" branding block inside the `app.live.tsx` component will be removed.
> - Spacing between the global header and "Daily Route" title will be compacted.

## Proposed Changes

### Daily Route Page (`src/routes/_authenticated/app.live.tsx`)

#### Header Refactoring
- Remove the `<header>` section (lines 136-142) that contains the duplicate branding.
- Retain only the page title "Daily Route" and its subtitle.
- Ensure the spacing between the global header and the page content is tight and professional.
- Set the "Daily Route" title font size to approximately 28-32px.

#### Spacing and Layout
- Audit the vertical gaps between the global header, page title, and "Today's Progress" section.
- Ensure no large blank areas are left behind after removing the duplicate block.

### Visual Hierarchy Standard
1. **Global App Header** (already in `app.tsx`)
2. **Daily Route** (Page Title)
3. **Your work sequence for today** (Subtitle)
4. **Today's Progress**
5. **Interactive Map**
6. **Next Stop**
7. **Up Next**
8. **Bottom Navigation** (already in `app.tsx`)

## Technical Details
- The duplicate branding is located in the `RoutePage` component inside `src/routes/_authenticated/app.live.tsx`.
- Spacing will be managed using Tailwind utility classes (`mt-`, `pt-`, `gap-`) to ensure a compact layout.
- No changes to functional logic (map, markers, logic) will be made.
