import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

/**
 * Force every Capacitor-related Android module to target Java 17.
 *
 * Two modules matter for us:
 *   1) @capacitor/android    – the core bridge; ships with sourceCompatibility 21
 *   2) capacitor-razorpay    – the Razorpay plugin; also 21
 *
 * If (2) is left at 21 while the host JDK is 17, Gradle silently drops the
 * plugin AAR from the final APK. The JS side then falls back to the web
 * plugin (Razorpay checkout.js inside the WebView), which hides UPI-intent
 * apps entirely — the exact "UPI works on web but not in APK" symptom.
 */
const targets = [
  "node_modules/@capacitor/android/capacitor/build.gradle",
  "node_modules/capacitor-razorpay/android/build.gradle",
];

let fatal = false;
for (const file of targets) {
  if (!existsSync(file)) {
    console.log(`[capacitor-java] skipped: ${file} not present`);
    continue;
  }
  const source = await readFile(file, "utf8");
  const patched = source.replace(/JavaVersion\.VERSION_21/g, "JavaVersion.VERSION_17");
  if (patched !== source) {
    await writeFile(file, patched, "utf8");
    console.log(`[capacitor-java] patched ${file}: VERSION_21 → VERSION_17`);
  } else if (patched.includes("JavaVersion.VERSION_17")) {
    console.log(`[capacitor-java] ${file} already VERSION_17`);
  } else {
    console.log(`[capacitor-java] ${file}: no Java 21 setting found (ok)`);
  }
  const verified = await readFile(file, "utf8");
  if (verified.includes("JavaVersion.VERSION_21")) {
    console.error(`[capacitor-java] failed: ${file} still contains JavaVersion.VERSION_21`);
    fatal = true;
  }
}

const razorpayPluginFile = "node_modules/capacitor-razorpay/android/src/main/java/com/ionicframework/capacitor/Checkout.java";
if (existsSync(razorpayPluginFile)) {
  const source = await readFile(razorpayPluginFile, "utf8");
  const patched = source
    .replace("import com.getcapacitor.NativePlugin;", "import com.getcapacitor.annotation.CapacitorPlugin;")
    .replace(/@NativePlugin\s*\(\s*requestCodes\s*=\s*\{com\.razorpay\.Checkout\.RZP_REQUEST_CODE\}\s*\)/, '@CapacitorPlugin(name = "Checkout")');
  if (patched !== source) {
    await writeFile(razorpayPluginFile, patched, "utf8");
    console.log(`[capacitor-java] patched ${razorpayPluginFile}: NativePlugin → CapacitorPlugin`);
  } else if (patched.includes('@CapacitorPlugin(name = "Checkout")')) {
    console.log(`[capacitor-java] ${razorpayPluginFile} already uses CapacitorPlugin`);
  } else {
    console.error(`[capacitor-java] failed: could not patch Razorpay Checkout annotation in ${razorpayPluginFile}`);
    fatal = true;
  }
}

function instrumentedRazorpayPluginSource() {
  return `package com.ionicframework.capacitor;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.razorpay.CheckoutActivity;
import com.razorpay.ExternalWalletListener;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(name = "Checkout")
public class Checkout extends Plugin {
    private static final String TAG = "UW_UPI_DIAG";
    private static final String PLUGIN_VERSION = "1.3.0";
    private static final String CONFIGURED_RAZORPAY_CHECKOUT_VERSION = "1.6.41";
    private static final String PLUGIN_SOURCE_FILE = "node_modules/capacitor-razorpay/android/src/main/java/com/ionicframework/capacitor/Checkout.java";
    private static final int MAX_DIAGNOSTIC_CHARS = 240000;
    private static final StringBuilder DIAGNOSTICS = new StringBuilder();

    private static final String[][] UPI_PACKAGES = new String[][] {
            { "Google Pay", "com.google.android.apps.nbu.paisa.user" },
            { "PhonePe", "com.phonepe.app" },
            { "Paytm", "net.one97.paytm" },
            { "BHIM", "in.org.npci.upiapp" },
            { "Amazon Pay UPI", "in.amazon.mShop.android.shopping" },
            { "Amazon Pay UPI", "com.amazon.mShop.android.shopping" }
    };

    @PluginMethod
    public void open(PluginCall call) {
        call.setKeepAlive(true);
        try {
            JSObject jsObject = call.getData();
            record("plugin version=" + PLUGIN_VERSION + " source=" + PLUGIN_SOURCE_FILE);
            record("invoker=JS Checkout.open -> capacitor-razorpay Checkout.open -> Intent CheckoutActivity OPTIONS");
            recordDeviceInfo();
            recordSdkVersion();
            JSObject packageSnapshot = detectUpiPackages();
            record("installed: " + packageSnapshot.toString());
            recordOrder(jsObject);
            record("checkout.open options: " + redact(jsObject.toString()));
            try {
                com.razorpay.Checkout.preload(getContext().getApplicationContext());
                record("Checkout.preload(applicationContext) invoked");
            } catch (Throwable t) {
                record("Checkout.preload failure: " + t.getMessage());
            }

            Intent intent = new Intent(getActivity(), CheckoutActivity.class);
            intent.putExtra("OPTIONS", jsObject.toString());
            intent.putExtra("FRAMEWORK", "capacitor");
            startActivityForResult(call, intent, "handleOnActivityResult");
        } catch (Exception e) {
            record("open exception: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            call.reject(e.getMessage() == null ? "Razorpay checkout open failed" : e.getMessage());
        }
    }

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
        call.resolve(buildSnapshot(null, false));
    }

    @PluginMethod
    public void exportDiagnostics(PluginCall call) {
        try {
            String webDiagnostics = call.getString("webDiagnostics", "");
            JSObject snapshot = buildSnapshot(webDiagnostics, true);
            String text = buildText(snapshot, webDiagnostics);
            String filename = "payment-diagnostics.txt";
            String uriOrPath = writeDiagnosticsFile(filename, text);
            record("exported diagnostics file=" + uriOrPath);
            JSObject ret = new JSObject();
            ret.put("filename", filename);
            ret.put("uri", uriOrPath);
            ret.put("path", uriOrPath);
            ret.put("shared", false);
            ret.put("message", "Saved payment-diagnostics.txt to Downloads or app files.");
            call.resolve(ret);
        } catch (Exception e) {
            record("export diagnostics failure: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            call.reject(e.getMessage() == null ? "Could not export diagnostics" : e.getMessage());
        }
    }

    @ActivityCallback
    private void handleOnActivityResult(PluginCall call, ActivityResult result) {
        final PluginCall lastSavedCall = call;
        record("Razorpay SDK activityResult resultCode=" + result.getResultCode() + " hasData=" + (result.getData() != null));
        com.razorpay.Checkout.handleActivityResult(getActivity(), com.razorpay.Checkout.RZP_REQUEST_CODE, result.getResultCode(), result.getData(), new PaymentResultWithDataListener() {
            @Override
            public void onPaymentSuccess(String paymentId, PaymentData paymentData) {
                try {
                    JSObject jsObject = new JSObject();
                    try {
                        JSONObject data = paymentData.getData();
                        record("Razorpay callback payment success paymentId=" + paymentId + " data=" + redact(data.toString()));
                        jsObject.put("response", data);
                    } catch (Exception e) {
                        record("Razorpay success callback data read failure: " + e.getMessage());
                    }
                    if (lastSavedCall == null) {
                        record("Razorpay success callback dropped: no saved PluginCall");
                        return;
                    }
                    lastSavedCall.resolve(jsObject);
                } catch (Exception e) {
                    record("Razorpay success callback exception: " + e.getMessage());
                }
            }

            @Override
            public void onPaymentError(int code, String description, PaymentData paymentData) {
                try {
                    String raw = "";
                    try { raw = paymentData == null ? "" : redact(paymentData.getData().toString()); } catch (Exception ignored) {}
                    record("Razorpay callback payment error code=" + code + " description=" + description + " data=" + raw);
                    if (lastSavedCall == null) return;
                    JSObject error = new JSObject();
                    error.put("code", code);
                    error.put("description", description);
                    error.put("data", raw);
                    lastSavedCall.reject(description == null ? "Payment failed" : description, String.valueOf(code), error);
                } catch (Exception e) {
                    record("Razorpay error callback exception: " + e.getMessage());
                }
            }
        }, new ExternalWalletListener() {
            @Override
            public void onExternalWalletSelected(String walletName, PaymentData paymentData) {
                String raw = "";
                try { raw = paymentData == null ? "" : redact(paymentData.getData().toString()); } catch (Exception ignored) {}
                record("Razorpay callback external wallet selected wallet=" + walletName + " data=" + raw);
                if (lastSavedCall != null) lastSavedCall.reject(walletName);
            }
        });
    }

    private void recordOrder(JSObject options) {
        try {
            JSObject order = new JSObject();
            order.put("order_id", options.getString("order_id"));
            order.put("amount", options.get("amount"));
            order.put("currency", options.getString("currency"));
            order.put("key", options.getString("key"));
            record("order: " + redact(order.toString()));
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
            String specVer = rzpPkg != null ? rzpPkg.getSpecificationVersion() : null;
            record("Checkout SDK Version implementationVersion=" + implVer
                    + " specificationVersion=" + specVer
                    + " configuredGradleVersion=" + CONFIGURED_RAZORPAY_CHECKOUT_VERSION);
        } catch (Throwable t) {
            record("sdk version probe failure: " + t.getMessage());
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
            record(label + " (" + pkg + ")=" + present);
        }
        try {
            Intent upiIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"));
            int handlers = pm.queryIntentActivities(upiIntent, 0).size();
            packages.put("upiIntentHandlers", handlers);
            record("upi://pay intent handlers=" + handlers);
        } catch (Throwable t) {
            record("upi intent query failure: " + t.getMessage());
        }
        packages.put("summary", byName);
        packages.put("detectedCount", detected);
        return packages;
    }

    private JSObject buildSnapshot(String webDiagnostics, boolean includeText) {
        recordDeviceInfo();
        recordSdkVersion();
        JSObject ret = new JSObject();
        ret.put("pluginVersion", "capacitor-razorpay " + PLUGIN_VERSION);
        ret.put("pluginSourceFile", PLUGIN_SOURCE_FILE);
        ret.put("checkoutInvoker", "JS Checkout.open from service.$slug.tsx calls capacitor-razorpay Checkout.open; native plugin starts com.razorpay.CheckoutActivity with OPTIONS JSON");
        ret.put("configuredSdkVersion", CONFIGURED_RAZORPAY_CHECKOUT_VERSION);
        ret.put("sdkVersion", CONFIGURED_RAZORPAY_CHECKOUT_VERSION);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("model", Build.MODEL);
        ret.put("androidVersion", Build.VERSION.RELEASE);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        ret.put("abi", Arrays.toString(Build.SUPPORTED_ABIS));
        ret.put("upiPackages", detectUpiPackages());
        if (includeText) ret.put("diagnosticsText", getDiagnosticsText(webDiagnostics));
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
                .replaceAll("(\\\"(?:key_secret|secret|razorpay_signature|signature)\\\"\\s*:\\s*\\\")[^\\\"]*(\\\")", "$1[REDACTED]$2")
                .replaceAll("(\\\"key\\\"\\s*:\\s*\\\")([^\\\"]{0,8})[^\\\"]*([^\\\"]{0,4})(\\\")", "$1$2…$3$4")
                .replaceAll("((?:key_secret|secret|razorpay_signature|signature)=)[^,} ]+", "$1[REDACTED]");
    }

    private static synchronized String getDiagnosticsText(String webDiagnostics) {
        StringBuilder out = new StringBuilder();
        out.append("Urban Wash payment diagnostics\n");
        out.append("Exported: ").append(timestamp()).append("\n");
        out.append("Plugin Version: capacitor-razorpay ").append(PLUGIN_VERSION).append("\n");
        out.append("Plugin Source File: ").append(PLUGIN_SOURCE_FILE).append("\n");
        out.append("Configured com.razorpay:checkout Version: ").append(CONFIGURED_RAZORPAY_CHECKOUT_VERSION).append("\n");
        out.append("Who invokes checkout: JS Checkout.open -> capacitor-razorpay Checkout.open -> CheckoutActivity OPTIONS Intent\n");
        out.append("\n--- Native Diagnostics ---\n").append(DIAGNOSTICS.toString());
        if (webDiagnostics != null && webDiagnostics.length() > 0) {
            out.append("\n--- Web Diagnostics ---\n").append(webDiagnostics).append("\n");
        }
        return out.toString();
    }

    private static String buildText(JSObject snapshot, String webDiagnostics) {
        return getDiagnosticsText(webDiagnostics) + "\n--- Snapshot JSON ---\n" + snapshot.toString() + "\n";
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
`;
}

// Replace the old plugin wrapper with an instrumented equivalent. This does
// not change payment verification, order creation, or subscription logic; it
// only logs/export diagnostics around the native Razorpay handoff.
if (existsSync(razorpayPluginFile)) {
  const source = await readFile(razorpayPluginFile, "utf8");
  const next = instrumentedRazorpayPluginSource();
  if (source !== next) {
    await writeFile(razorpayPluginFile, next, "utf8");
    console.log(`[capacitor-java] installed full Razorpay payment diagnostics in ${razorpayPluginFile}`);
  } else {
    console.log(`[capacitor-java] Razorpay payment diagnostics already installed`);
  }
}

if (fatal) process.exit(1);

