package com.urbanwash.payments;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/**
 * Urban Wash native Razorpay checkout.
 *
 * OWNED BY THIS APP MODULE — it is NOT a node_modules plugin and no post-sync
 * patch script is involved. `npx cap sync android` never touches app sources,
 * so this implementation survives every sync and every clean clone.
 *
 * Why the old integration failed: the upstream capacitor-razorpay plugin starts
 * com.razorpay.CheckoutActivity through a raw Intent. That bypasses the SDK's
 * own initialization (merchant key registration + internal extras), so the
 * activity finished instantly and the app looked like it crashed / auto-closed.
 * Here we always go through com.razorpay.Checkout.open(activity, options).
 */
@CapacitorPlugin(name = "UrbanWashCheckout")
public class UrbanWashCheckoutPlugin extends Plugin {
    private static final String TAG = "UW_PAY";
    private static final String PLUGIN_VERSION = "urbanwash-native-1.0.0";
    private static final String CONFIGURED_RAZORPAY_CHECKOUT_VERSION = "1.6.41";
    private static final String PLUGIN_SOURCE_FILE =
            "android/app/src/main/java/com/urbanwash/payments/UrbanWashCheckoutPlugin.java";
    private static final int MAX_DIAGNOSTIC_CHARS = 240000;
    private static final StringBuilder DIAGNOSTICS = new StringBuilder();

    private static String lastCheckoutPayload = "not captured";
    private static String lastOrderDetails = "not captured";
    private static String lastSdkVersionDetails = "not captured";
    private static String lastUpiUnavailableReason = "not flagged";
    private static JSObject lastUpiPackages = null;

    private static PluginCall PENDING_CALL = null;
    private static boolean LAUNCHED = false;

    /**
     * Only these keys exist in the Razorpay ANDROID SDK contract. Every other
     * key (method, display, config, modal, handler, callback_url, retry, ...)
     * belongs to web checkout.js and makes the native CheckoutActivity bail out
     * with no payment methods shown.
     */
    private static final String[] NATIVE_KEYS = {
            "key", "amount", "currency", "order_id", "name", "description",
            "image", "prefill", "notes", "theme", "timeout"
    };

    private static final String[][] UPI_PACKAGES = new String[][] {
            { "Google Pay", "com.google.android.apps.nbu.paisa.user" },
            { "PhonePe", "com.phonepe.app" },
            { "Paytm", "net.one97.paytm" },
            { "BHIM", "in.org.npci.upiapp" },
            { "Amazon Pay UPI", "in.amazon.mShop.android.shopping" },
            { "Amazon Pay UPI", "com.amazon.mShop.android.shopping" }
    };

    @Override
    public void load() {
        record("plugin loaded (" + PLUGIN_VERSION + "); native activity-result bridge armed");
    }

    // ─── Checkout ────────────────────────────────────────────────────────────

    @PluginMethod
    public void open(PluginCall call) {
        call.setKeepAlive(true);
        try {
            JSObject jsObject = call.getData();
            record("plugin version=" + PLUGIN_VERSION + " source=" + PLUGIN_SOURCE_FILE);
            recordDeviceInfo();
            recordSdkVersion();

            JSObject packageSnapshot = detectUpiPackages();
            lastUpiPackages = packageSnapshot;
            int detectedCount = packageSnapshot.optInt("detectedCount", 0);
            int handlerCount = packageSnapshot.optInt("upiIntentHandlers", 0);
            if (detectedCount == 0 && handlerCount == 0) {
                lastUpiUnavailableReason =
                        "Android PackageManager reports no visible UPI apps and no upi://pay handlers before checkout.";
                record("UPI unavailable reason=" + lastUpiUnavailableReason);
            } else {
                lastUpiUnavailableReason =
                        "UPI apps/handlers are visible to Android before checkout.";
            }

            recordOrder(jsObject);
            record("web-only keys dropped from native payload: " + droppedKeys(jsObject));

            JSONObject options = sanitizeOptions(jsObject);
            String key = options.optString("key", "");
            String orderId = options.optString("order_id", "");
            if (key.length() == 0 || orderId.length() == 0) {
                record("checkout aborted before launch: key or order_id missing from payload");
                call.reject("Razorpay payload incomplete (key/order_id missing)", "launch_failed");
                return;
            }
            lastCheckoutPayload = redact(options.toString());
            record("final native checkout payload: " + lastCheckoutPayload);

            try {
                com.razorpay.Checkout.preload(getContext().getApplicationContext());
            } catch (Throwable t) {
                record("Checkout.preload failure: " + t.getMessage());
            }

            // A previous call that never received an activity result must not
            // leak — settle it before taking ownership of the new one.
            if (PENDING_CALL != null) {
                try {
                    JSObject stale = new JSObject();
                    stale.put("cancelled", true);
                    stale.put("stale", true);
                    PENDING_CALL.resolve(stale);
                } catch (Throwable ignored) {
                }
            }
            PENDING_CALL = call;
            LAUNCHED = false;

            com.razorpay.Checkout checkout = new com.razorpay.Checkout();
            checkout.setKeyID(key);
            checkout.open(getActivity(), options);
            LAUNCHED = true;
            record("CheckoutActivity launched via SDK (RZP_REQUEST_CODE="
                    + com.razorpay.Checkout.RZP_REQUEST_CODE + ")");

            JSObject launchEvent = new JSObject();
            launchEvent.put("orderId", orderId);
            launchEvent.put("launchedAt", timestamp());
            notifyListeners("checkoutLaunched", launchEvent);
        } catch (Throwable t) {
            PENDING_CALL = null;
            record("open exception: " + t.getClass().getSimpleName() + ": " + t.getMessage());
            call.reject(t.getMessage() == null ? "Razorpay checkout open failed" : t.getMessage(), "launch_failed");
        }
    }

    /**
     * Called from MainActivity.onActivityResult. Checkout is launched by the
     * Razorpay SDK itself (not the Capacitor bridge), so the result lands on the
     * host Activity and must be forwarded here. Exactly one callback is emitted
     * per attempt: success, error, external wallet, or cancel.
     */
    public static boolean handleRazorpayActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode != com.razorpay.Checkout.RZP_REQUEST_CODE) return false;
        final PluginCall lastSavedCall = PENDING_CALL;
        PENDING_CALL = null;
        final boolean[] handled = { false };
        record("checkout returned: resultCode=" + resultCode + " hasData=" + (data != null) + " launched=" + LAUNCHED);
        try {
            com.razorpay.Checkout.handleActivityResult(
                    activity,
                    requestCode,
                    resultCode,
                    data,
                    new com.razorpay.PaymentResultWithDataListener() {
                        @Override
                        public void onPaymentSuccess(String paymentId, com.razorpay.PaymentData paymentData) {
                            handled[0] = true;
                            try {
                                JSObject jsObject = new JSObject();
                                try {
                                    JSONObject payload = paymentData.getData();
                                    record("payment success: paymentId=" + paymentId + " data=" + redact(payload.toString()));
                                    jsObject.put("response", payload);
                                } catch (Exception e) {
                                    record("success callback data read failure: " + e.getMessage());
                                }
                                if (lastSavedCall == null) {
                                    record("success callback dropped: no saved PluginCall");
                                    return;
                                }
                                lastSavedCall.resolve(jsObject);
                            } catch (Exception e) {
                                record("success callback exception: " + e.getMessage());
                            }
                        }

                        @Override
                        public void onPaymentError(int code, String description, com.razorpay.PaymentData paymentData) {
                            handled[0] = true;
                            try {
                                String raw = "";
                                try {
                                    raw = paymentData == null ? "" : redact(paymentData.getData().toString());
                                } catch (Exception ignored) {
                                }
                                record("payment error: code=" + code + " description=" + description + " data=" + raw);
                                if (lastSavedCall == null) return;
                                JSObject error = new JSObject();
                                error.put("code", code);
                                error.put("description", description);
                                error.put("data", raw);
                                error.put("launched", LAUNCHED);
                                lastSavedCall.reject(
                                        description == null ? "Payment failed" : description,
                                        String.valueOf(code),
                                        error);
                            } catch (Exception e) {
                                record("error callback exception: " + e.getMessage());
                            }
                        }
                    },
                    new com.razorpay.ExternalWalletListener() {
                        @Override
                        public void onExternalWalletSelected(String walletName, com.razorpay.PaymentData paymentData) {
                            handled[0] = true;
                            record("external wallet selected wallet=" + walletName);
                            if (lastSavedCall != null) lastSavedCall.reject(walletName, "external_wallet");
                        }
                    });
        } catch (Throwable t) {
            record("handleActivityResult failure: " + t.getClass().getSimpleName() + ": " + t.getMessage());
        }
        if (!handled[0] && lastSavedCall != null) {
            record("payment cancelled: checkout returned without a Razorpay callback");
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            ret.put("launched", LAUNCHED);
            lastSavedCall.resolve(ret);
        }
        return true;
    }

    // ─── Diagnostics ─────────────────────────────────────────────────────────

    @PluginMethod
    public void recordDiagnostics(PluginCall call) {
        String line = call.getString("line", "");
        if (line.length() > 0) record("web: " + line);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        call.resolve(buildSnapshot());
    }

    @PluginMethod
    public void exportDiagnostics(PluginCall call) {
        try {
            String webDiagnostics = call.getString("webDiagnostics", "");
            JSObject snapshot = buildSnapshot();
            String text = getDiagnosticsText(webDiagnostics)
                    + "\n--- Snapshot JSON ---\n" + snapshot.toString() + "\n";
            String filename = "payment-diagnostics.txt";
            String uriOrPath = writeDiagnosticsFile(filename, text);
            JSObject ret = new JSObject();
            ret.put("filename", filename);
            ret.put("uri", uriOrPath);
            ret.put("path", uriOrPath);
            ret.put("shared", false);
            ret.put("message", "Saved payment-diagnostics.txt to Downloads or app files.");
            call.resolve(ret);
        } catch (Exception e) {
            record("export diagnostics failure: " + e.getMessage());
            call.reject(e.getMessage() == null ? "Could not export diagnostics" : e.getMessage());
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private JSONObject pruneEmpty(JSONObject src) throws Exception {
        JSONObject out = new JSONObject();
        java.util.Iterator<String> it = src.keys();
        while (it.hasNext()) {
            String k = it.next();
            Object v = src.opt(k);
            if (v == null || v == JSONObject.NULL) continue;
            if (v instanceof String && ((String) v).trim().length() == 0) continue;
            out.put(k, v);
        }
        return out;
    }

    private JSONObject sanitizeOptions(JSObject raw) throws Exception {
        JSONObject out = new JSONObject();
        for (String k : NATIVE_KEYS) {
            Object v = raw.opt(k);
            if (v == null || v == JSONObject.NULL) continue;
            if (v instanceof String && ((String) v).trim().length() == 0) continue;
            if (v instanceof JSONObject) {
                JSONObject nested = pruneEmpty((JSONObject) v);
                if (nested.length() == 0) continue;
                out.put(k, nested);
                continue;
            }
            out.put(k, v);
        }
        return out;
    }

    private String droppedKeys(JSObject raw) {
        StringBuilder dropped = new StringBuilder();
        java.util.Iterator<String> it = raw.keys();
        while (it.hasNext()) {
            String k = it.next();
            boolean allowed = false;
            for (String allow : NATIVE_KEYS) if (allow.equals(k)) { allowed = true; break; }
            if (!allowed) {
                if (dropped.length() > 0) dropped.append(", ");
                dropped.append(k);
            }
        }
        return dropped.length() == 0 ? "none" : dropped.toString();
    }

    private void recordOrder(JSObject options) {
        try {
            JSObject order = new JSObject();
            order.put("order_id", options.getString("order_id"));
            order.put("amount", options.get("amount"));
            order.put("currency", options.getString("currency"));
            order.put("key", options.getString("key"));
            lastOrderDetails = redact(order.toString());
            record("order: " + lastOrderDetails);
        } catch (Exception e) {
            record("order log failure: " + e.getMessage());
        }
    }

    private void recordDeviceInfo() {
        record("android info: Manufacturer=" + Build.MANUFACTURER
                + " Model=" + Build.MODEL
                + " Android Version=" + Build.VERSION.RELEASE
                + " SDK=" + Build.VERSION.SDK_INT
                + " ABI=" + Arrays.toString(Build.SUPPORTED_ABIS));
    }

    private void recordSdkVersion() {
        try {
            Package rzpPkg = com.razorpay.Checkout.class.getPackage();
            String implVer = rzpPkg != null ? rzpPkg.getImplementationVersion() : null;
            lastSdkVersionDetails = "implementationVersion=" + implVer
                    + " configuredGradleVersion=" + CONFIGURED_RAZORPAY_CHECKOUT_VERSION;
            record("Razorpay SDK " + lastSdkVersionDetails);
        } catch (Throwable t) {
            lastSdkVersionDetails = "sdk version probe failure: " + t.getMessage();
        }
    }

    private JSObject detectUpiPackages() {
        JSObject packages = new JSObject();
        JSObject byName = new JSObject();
        PackageManager pm = getContext().getPackageManager();
        int detected = 0;
        for (String[] entry : UPI_PACKAGES) {
            String label = entry[0];
            String pkg = entry[1];
            boolean present;
            try {
                pm.getPackageInfo(pkg, 0);
                present = true;
                detected++;
            } catch (PackageManager.NameNotFoundException nnf) {
                present = false;
            }
            packages.put(pkg, present);
            if (present || !byName.has(label)) byName.put(label, present);
        }
        try {
            Intent upiIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"));
            int handlers = pm.queryIntentActivities(upiIntent, 0).size();
            packages.put("upiIntentHandlers", handlers);
        } catch (Throwable t) {
            record("upi intent query failure: " + t.getMessage());
        }
        packages.put("summary", byName);
        packages.put("detectedCount", detected);
        return packages;
    }

    private JSObject buildSnapshot() {
        recordDeviceInfo();
        recordSdkVersion();
        JSObject ret = new JSObject();
        ret.put("pluginVersion", PLUGIN_VERSION);
        ret.put("pluginSourceFile", PLUGIN_SOURCE_FILE);
        ret.put("configuredSdkVersion", CONFIGURED_RAZORPAY_CHECKOUT_VERSION);
        ret.put("sdkVersion", CONFIGURED_RAZORPAY_CHECKOUT_VERSION);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("model", Build.MODEL);
        ret.put("androidVersion", Build.VERSION.RELEASE);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        ret.put("abi", Arrays.toString(Build.SUPPORTED_ABIS));
        ret.put("upiPackages", detectUpiPackages());
        ret.put("finalCheckoutPayload", lastCheckoutPayload);
        ret.put("orderDetails", lastOrderDetails);
        ret.put("upiUnavailableReason", lastUpiUnavailableReason);
        return ret;
    }

    private static synchronized void record(String message) {
        String line = timestamp() + " " + message;
        Log.i(TAG, line);
        DIAGNOSTICS.append(line).append("\n");
        if (DIAGNOSTICS.length() > MAX_DIAGNOSTIC_CHARS) {
            DIAGNOSTICS.delete(0, DIAGNOSTICS.length() - MAX_DIAGNOSTIC_CHARS);
        }
    }

    private static String timestamp() {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(new Date());
    }

    private static String redact(String raw) {
        if (raw == null) return "";
        return raw
                .replaceAll("(\"(?:key_secret|secret|razorpay_signature|signature)\"\\s*:\\s*\")[^\"]*(\")", "$1[REDACTED]$2")
                .replaceAll("((?:key_secret|secret|razorpay_signature|signature)=)[^,} ]+", "$1[REDACTED]");
    }

    private static synchronized String getDiagnosticsText(String webDiagnostics) {
        StringBuilder out = new StringBuilder();
        out.append("Urban Wash payment diagnostics\n");
        out.append("Exported: ").append(timestamp()).append("\n");
        out.append("Plugin: ").append(PLUGIN_VERSION).append("\n");
        out.append("Plugin source: ").append(PLUGIN_SOURCE_FILE).append("\n");
        out.append("Configured com.razorpay:checkout: ").append(CONFIGURED_RAZORPAY_CHECKOUT_VERSION).append("\n");
        out.append("Resolved SDK: ").append(lastSdkVersionDetails).append("\n");
        out.append("UPI packages: ").append(lastUpiPackages == null ? "not captured" : lastUpiPackages.toString()).append("\n");
        out.append("Final checkout payload: ").append(lastCheckoutPayload).append("\n");
        out.append("Order details: ").append(lastOrderDetails).append("\n");
        out.append("UPI unavailable reason: ").append(lastUpiUnavailableReason).append("\n");
        out.append("\n--- Native diagnostics ---\n").append(DIAGNOSTICS.toString());
        if (webDiagnostics != null && webDiagnostics.length() > 0) {
            out.append("\n--- Web diagnostics ---\n").append(webDiagnostics).append("\n");
        }
        return out.toString();
    }

    private String writeDiagnosticsFile(String filename, String text) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Could not create diagnostics file in Downloads");
            try (OutputStream os = getContext().getContentResolver().openOutputStream(uri);
                 OutputStreamWriter writer = new OutputStreamWriter(os)) {
                writer.write(text);
            }
            return uri.toString();
        }

        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = getContext().getFilesDir();
        if (!dir.exists()) dir.mkdirs();
        File file = new File(dir, filename);
        try (FileOutputStream fos = new FileOutputStream(file);
             OutputStreamWriter writer = new OutputStreamWriter(fos)) {
            writer.write(text);
        }
        return file.getAbsolutePath();
    }
}
