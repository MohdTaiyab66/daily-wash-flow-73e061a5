# Razorpay Version Findings

## Isolation sample

- `com.razorpay:checkout`: **1.6.41** pinned in `app/build.gradle`.
- Source of version: Maven metadata reports latest/release `1.6.41`.

## Urban Wash production app

- `capacitor-razorpay`: **1.3.0** from `package.json`.
- Plugin Android dependency: `implementation 'com.razorpay:checkout:1.6.+'` in `node_modules/capacitor-razorpay/android/build.gradle` after install.
- Because the plugin uses a dynamic `1.6.+` range, the exact packaged SDK must be confirmed from the built Android project:

```bat
cd android
gradlew.bat :app:dependencies --configuration debugRuntimeClasspath | findstr /I "razorpay checkout capacitor-razorpay"
```

Expected today if Gradle resolves the latest 1.6.x line:

```text
com.razorpay:checkout:1.6.41
```

## Plugin wrapper behavior

`capacitor-razorpay@1.3.0` does not call `new com.razorpay.Checkout().open(activity, options)` directly from the app activity. Its Android wrapper:

1. Receives the JS options object.
2. Starts `com.razorpay.CheckoutActivity` manually using an `Intent`.
3. Passes `OPTIONS` as `jsObject.toString()`.
4. Passes `FRAMEWORK=capacitor`.
5. Later calls `com.razorpay.Checkout.handleActivityResult(...)` and resolves/rejects the Capacitor plugin call.

That is materially different from the official Android sample path used here, which calls:

```java
Checkout checkout = new Checkout();
checkout.setKeyID(keyId);
checkout.open(activity, options);
```

## Maintenance risk

- The installed plugin is `capacitor-razorpay@1.3.0`.
- Its package metadata points to `https://github.com/razorpay/razorpay-cordova`, not a dedicated modern Capacitor repository.
- It declares Capacitor peer support `>=7.0.0`, while Urban Wash is on Capacitor 8.
- Its wrapper class originally used older Capacitor plugin annotation APIs and is patched locally by `scripts/patch-capacitor-java.mjs`.

Conclusion: this plugin is a plausible suspect if the official sample shows UPI but Urban Wash APK does not.