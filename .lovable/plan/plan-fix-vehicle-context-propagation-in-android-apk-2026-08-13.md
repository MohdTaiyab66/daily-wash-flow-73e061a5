# Plan: Fix Vehicle Context Propagation in Android APK

The user reports that the Android APK is still displaying the wrong vehicle (Creta instead of Alto) and running an older build (`B:2026-08-13-DIAG-A` instead of `FIX-B`). This plan focuses on ensuring the build ID is unmistakably updated for verification and that the vehicle context is strictly propagated without silent fallbacks.

## User Review Required

> [!IMPORTANT]
> This plan assumes that the APK generation process correctly picks up the latest source code from the repository. If the APK still shows the old build ID after these changes, the issue lies in the build/deployment pipeline, not the application logic.

## Technical Details

### 1. Build Verification
- Update `src/lib/apkEvidence.ts` and `src/routes/c/_authed/home.tsx` to `1.0.32-FIX-B-01`.
- Update the unmistakable diagnostic marker in `src/routes/c/_authed/service.$slug.tsx` to `BUILD: 2026-08-13-FIX-B`.
- This ensures the user can verify they are running the new code.

### 2. Strict Vehicle Propagation
- **Home to Service Detail**: Ensure `selectedVehicleId` is passed in the search params for all navigation points (One-time services and Daily Shine banner).
- **Service Detail Persistence**:
    - Remove the silent fallback `vehicles[0]` in `ServiceDetail`.
    - If `search.vehicleId` is missing or the vehicle is not found in the customer's list, show a "Vehicle selection required" error screen with a "Back to Home" button.
    - Use `useMemo` to resolve the vehicle once from `search.vehicleId`.

### 3. Price Resolution
- Ensure `resolveDailyShinePrice` is called with the resolved vehicle's category.
- Display the resolved price in the diagnostic marker for real-time verification.

### 4. Code Cleanup
- The diagnostic marker will be placed at the top-level of the `ServiceDetail` component to be unmistakable.
- Once the user confirms the fix in the APK, these markers will be removed in a subsequent task.

## Verification Plan

### Automated Tests
- None requested; focus is on manual APK verification.

### Manual Verification
1. Open the updated APK.
2. Verify the Home header shows `buildId="1.0.32-FIX-B-01"`.
3. Select "Maruti Alto K10" on Home.
4. Click "Daily Shine" banner or any service card.
5. Verify `ServiceDetail` shows `BUILD: 2026-08-13-FIX-B` in the diagnostic overlay.
6. Verify `V: Alto K10` and `P: ₹999` are shown in the diagnostic overlay.
7. Repeat with "Creta" and verify `V: Creta` and `P: ₹1199`.
