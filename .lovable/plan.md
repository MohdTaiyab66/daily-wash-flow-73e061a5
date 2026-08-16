# Urban Wash Partner — Daily Route Page Redesign

Overhaul the "Daily Route" page (`src/routes/_authenticated/app.live.tsx`) to improve hierarchy, reduce clutter, and optimize for operational efficiency on Android devices.

## User-facing Changes

### 1. Layout & Hierarchy
- **Header:** Compact 32px title with refined typography and subtitles.
- **Today's Progress:** Move to the top, directly below the header. Premium compact card with progress bar, completion count, and real-time earnings.
- **Route Map:** Reduced height (220-260px) with rounded corners (24px). Numbered sequence markers (1, 2, 3...).
- **Current/Next Customer:** Premium work card highlighting one active job. Larger "START SERVICE" primary action. Secondary circular buttons for navigation and calling.
- **Up Next Section:** Compact rows for upcoming stops (75-85px) instead of repetitive large cards. No "START" buttons on future stops.
- **Completed Section:** Collapsible list to keep the active workflow focused.

### 2. UI & Interaction Improvements
- **Visual Style:** White background with premium dark charcoal cards, Urban Wash orange accents, and success-green indicators.
- **Service Logic:** Enforce "START SERVICE" availability based on existing business rules. Show "Available in X min" or "Starts at HH:MM" if early.
- **Data Integrity:** Fix the "Before Before" time formatting bug. Ensure map and list order are perfectly synchronized.
- **Mobile Optimization:** Fix bottom navigation clipping and safe-area padding for Android devices. Ensure horizontal responsiveness (360px+).

## Technical Details

### 1. Code Restructuring
- Refactor `RoutePage` to follow the new section order: Header -> Progress -> Map -> Current -> Up Next -> Completed.
- Extract sub-components like `CompactProgress`, `CompactQueueRow`, and `CollapsibleCompleted` for cleaner rendering.
- Update `formatTime12` and usage to prevent "Before Before" concatenation.
- Implement `getExplicitStatus` for the current stop to handle time-gated buttons correctly.

### 2. State & Data
- Maintain existing `useQuery` hooks and Supabase integration.
- Ensure `earnedSoFar` and `remaining` counts update reactively.
- Synchronize map markers with the list using `sequence_no`.
- Implement virtualization or efficient rendering if stop counts are high.

### 3. CSS & Styling
- Use semantic Tailwind tokens matching the Urban Wash design system.
- Implement `pb-[calc(70px+env(safe-area-inset-bottom)+20px)]` to prevent footer overlap.
- Enforce one primary action (Orange CTA) per screen.
