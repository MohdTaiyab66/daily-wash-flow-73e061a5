# FINAL MANUAL LOCATION PAGE REDESIGN

Redesigning the manual location search screen from scratch to provide a clean, focused, and premium experience that follows the Urban Wash design language (Black/Orange/White).

## User-facing changes
- **Focused Search UI**: Replaced the cluttered layout with a clean hierarchy: Header -> Functional Search Input -> Compact Map -> Search Results.
- **Premium Design**: 58px white search input with orange icon and subtle shadow.
- **Improved Map**: Natural Google Maps styling in a compact 200px rounded container.
- **One-Job Page**: Removed redundant "Use current location" and status banners from the manual flow.
- **Actionable Results**: Clean list rows for search results with proper dividers and location icons.
- **Confirmation State**: "LOCATION SET" confirmation card and "Continue" button appear only after a selection is made.

## Technical details
- **Restructuring `manual_entry` view**: The `src/routes/c/location.search.tsx` will be updated to remove unnecessary intermediate views and focus strictly on the search-select-confirm flow.
- **Keyboard Handling**: Improved layout flexibility to ensure the search field and results stay visible above the Android keyboard.
- **Logic Integration**: Reuse existing Google Places Autocomplete and Geocoding functions for real-time results.
- **Removal of Screen 2**: The redundant "Location" screen (the generic confirmation page) will be eliminated from the manual flow's intermediate steps.
- **Serviceability Check**: Integrate serviceability validation before allowing the "Continue" action.
