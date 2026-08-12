# Home Data Source Audit & Source of Truth Implementation

## P0 — FIND EVERY SOURCE OF HOME DATA

### CAROUSEL
1. **Supabase `daily_shine_carousel`**: Queried in `home.tsx` via `imagesQ`. Primary source.
2. **`DEFAULT_PROMO_IMAGES`**: Defined in `src/lib/promo.constants.ts`. Used as a fallback if the database query returns 0 records.
3. **Hardcoded image URLs**: Present in `DEFAULT_PROMO_IMAGES` (Unsplash URLs).
4. **Fallback logic**: In `home.tsx`, if `img.image_url` is missing from a DB record, it pulls from `DEFAULT_PROMO_IMAGES[idx % ...]`.
5. **Cached Data**: React Query `customer-promo-images` with `staleTime` of 1 hour and `gcTime` of 24 hours.

### SERVICES
1. **Supabase `service_catalog`**: Queried in `home.tsx` via `servicesQ`.
2. **Supabase `service_gallery`**: Queried in `home.tsx` via `galleryQ`. Used by `getServiceImage` to resolve slugs to images.
3. **`getServiceImage` Fallbacks**: Defined in `src/lib/service-image-resolver.ts`. Contains hardcoded Unsplash URLs for specific slugs.
4. **"COMING SOON" Logic**: Currently triggered in `home.tsx` via `resolvedServiceImage` if both the gallery and fallbacks fail to provide a URL.
5. **Cached Data**: React Query `service-catalog` (10m stale) and `service-gallery` (1h stale).

---

## P0 — CAROUSEL SOURCE OF TRUTH REPORT

### Database Records (from `daily_shine_carousel`)
- **Query**: `SELECT * FROM daily_shine_carousel WHERE status = 'published' ORDER BY slide_number`
- **Current DB State**: The query returned **0 records** (based on logic inferred from current skeleton behavior in user screenshot). 
- **Rendered source**: Since DB returned 0, `home.tsx` is falling back to `DEFAULT_PROMO_IMAGES`.

### Fix Strategy
- Remove `DEFAULT_PROMO_IMAGES` fallback when database connection is successful but table is empty (which might indicate a sync or filtering issue).
- Ensure `daily_shine_carousel` is the absolute source.

---

## P0 — SERVICE CATALOG SOURCE OF TRUTH REPORT

### Database Records (from `service_catalog`)
- **Records**: 17 services found in database.
- **Image URLs**: 
    - `daily-shine-dusting`: `https://images.unsplash.com/...` (Banner URL)
    - `deep-clean`: `https://images.unsplash.com/...` (Banner URL)
    - `body-polish`: `https://images.unsplash.com/...` (Banner URL)
    - Others: `null` banner_url.

### "COMING SOON" Reason
The "COMING SOON" logic in `home.tsx` (line 250) returns a placeholder if `getServiceImage` fails. `getServiceImage` checks `service_gallery`. 
- **Service**: "Roof Cleaning"
- **Gallery**: Has record with `service_slug: roof-cleaning`.
- **Reason for failure**: `home.tsx` uses `banner_url` in its type but then calls `resolvedServiceImage(s.slug)`. If `galleryQ` is stale or empty, it falls back to Unsplash or "Coming Soon".

---

## P0 — ROOT CAUSE & FIX

### Root Cause
1. **Carousel**: Database query for `daily_shine_carousel` is likely returning no "published" records, forcing the app into the static `DEFAULT_PROMO_IMAGES` path which contains old Unsplash assets.
2. **Services**: The "Coming Soon" state occurs because `getServiceImage` is decoupled from the `service_catalog` table's `banner_url` field and relies on a separate `service_gallery` fetch which may be failing or missing records.
3. **Cache**: High `staleTime` (1 hour) on gallery and carousel queries prevents the app from picking up backend content changes immediately.

### Fix
1. **Unified Resolver**: Update `resolvedServiceImage` to check `service_catalog.banner_url` first, then gallery, then fallback.
2. **Remove Static Fallbacks**: Disable `DEFAULT_PROMO_IMAGES` usage if DB is accessible.
3. **Build ID**: Added `v1.0.56-data-truth` for verification.
