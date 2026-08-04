package com.urbanwash.payments;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.razorpay.Checkout;

import org.json.JSONObject;

/**
 * New minimal Razorpay Android bridge.
 *
 * Exactly one public method: open(options). No preload, no diagnostics,
 * no retry, no fallback, no analytics. Errors only are logged.
 *
 * NOT WIRED YET: this plugin is intentionally not registered in MainActivity.
 * To activate it later, register the class and forward the host activity's
 * onActivityResult to {@link #handleActivityResult}.
 */
@CapacitorPlugin(name = "UWCheckout")
public class UWCheckoutPlugin extends Plugin {
    private static final String TAG = "UWCheckout";

    private static final String[] KEYS = {
            "key", "order_id", "amount", "currency", "name", "description",
            "prefill", "notes", "theme"
    };

    private static PluginCall PENDING = null;

    @PluginMethod
    public void open(PluginCall call) {
        call.setKeepAlive(true);
        try {
            JSObject data = call.getData();
            final JSONObject options = new JSONObject();
            for (String k : KEYS) {
                if (data.has(k) && !data.isNull(k)) options.put(k, data.get(k));
            }

            final String key = options.optString("key", "");
            if (key.length() == 0 || options.optString("order_id", "").length() == 0) {
                call.reject("key and order_id are required", "invalid_options");
                return;
            }

            final Activity activity = getActivity();
            if (activity == null) {
                call.reject("No host activity", "no_activity");
                return;
            }

            PENDING = call;
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Checkout checkout = new Checkout();
                        checkout.setKeyID(key);
                        checkout.open(activity, options);
                    } catch (Throwable t) {
                        Log.e(TAG, "checkout open failed", t);
                        PluginCall pending = PENDING;
                        PENDING = null;
                        if (pending != null) {
                            pending.reject(message(t), "checkout_error");
                        }
                    }
                }
            });
        } catch (Throwable t) {
            Log.e(TAG, "checkout open failed", t);
            PENDING = null;
            call.reject(message(t), "checkout_error");
        }
    }

    /** Forward from the host Activity's onActivityResult. */
    public static boolean handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != Checkout.RZP_REQUEST_CODE) return false;
        PluginCall call = PENDING;
        PENDING = null;
        if (call == null) return true;

        String paymentId = data == null ? null : data.getStringExtra("razorpay_payment_id");
        if (resultCode == Activity.RESULT_OK && paymentId != null) {
            JSObject result = new JSObject();
            result.put("payment_id", paymentId);
            result.put("order_id", data.getStringExtra("razorpay_order_id"));
            result.put("signature", data.getStringExtra("razorpay_signature"));
            call.resolve(result);
        } else {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
        }
        return true;
    }

    private static String message(Throwable t) {
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }
}
