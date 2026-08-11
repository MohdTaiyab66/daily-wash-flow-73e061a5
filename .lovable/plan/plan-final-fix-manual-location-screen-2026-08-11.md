# Plan - Final Fix Manual Location Screen

Refactor the manual location search screen to provide a real interactive search UI, properly handling keyboard resize, auto-focus, and visual hierarchy as requested.

## User-facing changes
- **Real Search Input**: A high-visibility, functional input field that opens the keyboard and accepts text immediately.
- **Auto-focus**: Entering the manual location screen automatically focuses the input and opens the keyboard.
- **Improved Layout**: Results appear directly below the search bar, with the map shrinking to provide space, ensuring search results stay visible above the keyboard.
- **UI Cleanup**: Removed large gray rectangles and empty placeholder cards, replaced with a compact informational state.
- **Interactive Results**: Clean, row-based search results with brand-aligned icons and typography.

## Technical details
- **Refactor `src/routes/c/location.search.tsx`**:
    - Reorder DOM elements in the `manual_entry` view: Header -> Search Input -> Results/Helper -> Map.
    - Use a flexbox-based layout (`flex-col`) with `flex-1` and `overflow-y-auto` on the results container to ensure it stays scrollable and above the keyboard while the map shrinks.
    - Implement a proper `ref` for the search input to trigger `.focus()` on mount.
    - Update `suggestions` list styling to be compact rows.
    - Integrate with the existing `chooseSuggestion` logic to ensure location selection updates the map and persists the choice.
    - Ensure the "LOCATION SET" state is visible and functional after a selection is made.
    - Restore natural Google Maps styling (already mostly done, but verify).
