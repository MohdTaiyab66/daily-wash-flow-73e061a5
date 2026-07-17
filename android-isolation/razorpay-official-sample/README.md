# Urban Wash Razorpay Android Isolation Sample

Purpose: prove whether UPI is hidden by Urban Wash's Capacitor/plugin/runtime or by the official Razorpay Android SDK / account behavior.

This sample is intentionally plain Android:

- No Capacitor
- No Urban Wash UI
- No `capacitor-razorpay`
- No custom checkout `config.display` or method filtering
- Direct dependency on `com.razorpay:checkout:1.6.41`
- Calls the same published Urban Wash order server-function endpoint: `/_serverFn/c11039392aee38661b33db6357cf41f849f442d1787cd0964b97693392455302`

## Inputs required on the test phone

1. An existing unpaid Urban Wash booking UUID for the signed-in customer.
2. That same customer's bearer token. This is a secret; use it only locally on the test phone and never send it in chat.

The backend order API is auth-protected, so a token is required. Do not create a public order endpoint just for this test.

## Build

Open this folder in Android Studio:

```text
android-isolation/razorpay-official-sample
```

Then build/install the debug APK, or run from this folder if Gradle is available:

```bat
gradle :app:assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Verify packaged SDK version

From the sample folder:

```bat
gradle :app:dependencies --configuration debugRuntimeClasspath | findstr /I razorpay
```

Expected:

```text
com.razorpay:checkout:1.6.41
```

## Test steps

1. Install Google Pay / PhonePe on the device.
2. Open **RZP Isolation**.
3. Enter:
   - Backend base URL: `https://daily-wash-flow.lovable.app`
   - Existing unpaid booking UUID
   - Customer bearer token
4. Tap **Create Order → Checkout.open**.
5. Capture screenshot of the Razorpay payment-method screen.
6. Capture logs:

```bat
adb logcat -c
adb logcat -s RZP_ISOLATION:D Razorpay:D Checkout:D chromium:V *:S
```

## Expected interpretation

- UPI appears in this sample → production issue is in Urban Wash Android integration, the Capacitor bridge, or plugin behavior.
- UPI does not appear in this sample → issue is outside Urban Wash UI/Capacitor, most likely official SDK behavior, device/package visibility behavior, or Razorpay account/order configuration despite matching keys.

## Redacted payload shape

The sample logs this exact minimal native SDK payload shape before calling `Checkout.open`:

```json
{
  "key": "rzp_test_…",
  "name": "Urban Wash",
  "description": "Official Android SDK isolation",
  "order_id": "order_…",
  "currency": "INR",
  "amount": 100,
  "prefill": {},
  "notes": {
    "booking_id": "…",
    "source": "android_official_sdk_isolation"
  },
  "theme": { "color": "#FF6B1A" }
}
```

There is no `config`, no `display.blocks`, no `method`, and no Capacitor wrapper.