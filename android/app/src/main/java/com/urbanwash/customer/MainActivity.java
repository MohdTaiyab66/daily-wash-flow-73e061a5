package com.urbanwash.customer;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;
import com.urbanwash.payments.UrbanWashCheckoutPlugin;

/**
 * The Razorpay SDK delivers checkout results by reflectively invoking
 * onPaymentSuccess/onPaymentError on the activity that called Checkout.open().
 * Without this interface the SDK logs "onPaymentSuccess probably not implemented"
 * and the payment result never reaches the Capacitor bridge.
 */
public class MainActivity extends BridgeActivity implements PaymentResultWithDataListener {

    private static final String TAG = "UW_CUSTOMER";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The single payment bridge. No other checkout plugin exists.
        registerPlugin(UrbanWashCheckoutPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        try {
            // Razorpay's CheckoutActivity is started by the SDK, so its result
            // arrives here and must be forwarded to the bridge.
            UrbanWashCheckoutPlugin.handleActivityResult(requestCode, resultCode, data);
        } catch (Throwable t) {
            Log.e(TAG, "Razorpay activity result forwarding failed", t);
        }
    }

    @Override
    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
        try {
            UrbanWashCheckoutPlugin.handlePaymentSuccess(
                    razorpayPaymentId,
                    paymentData == null ? null : paymentData.getOrderId(),
                    paymentData == null ? null : paymentData.getSignature());
        } catch (Throwable t) {
            Log.e(TAG, "onPaymentSuccess forwarding failed", t);
        }
    }

    @Override
    public void onPaymentError(int code, String description, PaymentData paymentData) {
        try {
            UrbanWashCheckoutPlugin.handlePaymentError(code, description);
        } catch (Throwable t) {
            Log.e(TAG, "onPaymentError forwarding failed", t);
        }
    }
}
