# Physical Device Diagnostic: missing UPI in Razorpay Checkout

## Analysis
The Razorpay checkout is opening successfully, meaning the native bridge and SDK invocation are functional. However, UPI options are missing. This is likely due to:
1. **Missing Prefill Contact**: Razorpay UPI Intent often requires a prefilled contact number (+91...). Currently, the prefill object is sent but may be empty if the user profile is not loaded.
2. **Missing Package Visibility**: While many UPI packages are already in `AndroidManifest.xml`, some might be missing or the intent filter might be incomplete for newer Android versions.
3. **Native Plugin Diagnostics**: The native plugin does not log enough details about the UPI environment.

## Proposed Changes

### 1. Data Loading in `service.$slug.tsx`
- Fetch the customer's profile (phone/email) at the top level.
- Pass `prefillContact` and `prefillEmail` to `openRazorpayCheckout`.

### 2. Native Plugin Enhancements
- Add `[UW_UPI_DIAG]` logs to `UrbanWashCheckoutPlugin.java`.
- Verify which UPI apps are detected as installed on the device via the plugin.

### 3. Android Manifest
- Ensure comprehensive `<queries>` for all major Indian UPI apps.
- Add missing common packages if found during audit.

### 4. Build Synchronization
- Run `bun run build` and `npx cap sync android`.
- Generate fresh APK for testing on the Samsung Galaxy A04e.

## Technical Details
- **Razorpay SDK**: `com.razorpay:standard-core:1.7.18` (Verified in `build.gradle`).
- **Target SDK**: 36 (Verified in `variables.gradle`).
- **Platform**: Android 14 (Physical Device).
- **Variant**: Customer (`com.urbanwash.customer`).
