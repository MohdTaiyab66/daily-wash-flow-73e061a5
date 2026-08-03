package com.urbanwash.customer;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.urbanwash.payments.UrbanWashCheckoutPlugin;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "UW_CUSTOMER";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Single registration point for the payment plugin. It lives in this
        // app module (not node_modules), so Capacitor does not auto-discover it
        // and there is exactly one registration in the whole app.
        registerPlugin(UrbanWashCheckoutPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        try {
            // Razorpay's CheckoutActivity is started by the SDK, so its result
            // arrives here and must be forwarded to the plugin.
            UrbanWashCheckoutPlugin.handleRazorpayActivityResult(this, requestCode, resultCode, data);
        } catch (Throwable t) {
            Log.e(TAG, "Razorpay activity result forwarding failed", t);
        }
    }
}
