package com.urbanwash.customer;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.urbanwash.payments.UWCheckoutPlugin;
import com.urbanwash.payments.UrbanWashCheckoutPlugin;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "UW_CUSTOMER";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Active payment bridge.
        registerPlugin(UWCheckoutPlugin.class);
        // Legacy bridge — kept registered but no longer used by the web app.
        registerPlugin(UrbanWashCheckoutPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        try {
            // Razorpay's CheckoutActivity is started by the SDK, so its result
            // arrives here and must be forwarded to the active bridge first.
            if (UWCheckoutPlugin.handleActivityResult(requestCode, resultCode, data)) {
                return;
            }
            UrbanWashCheckoutPlugin.handleRazorpayActivityResult(this, requestCode, resultCode, data);
        } catch (Throwable t) {
            Log.e(TAG, "Razorpay activity result forwarding failed", t);
        }
    }
}
