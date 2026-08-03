package com.urbanwash.customer;







import android.content.Intent;
import com.ionicframework.capacitor.Checkout;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.util.Log;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Checkout.class);
        Log.i("PARTNER_BUILD", "PARTNER_BUILD=partner BUILD_NUMBER=32 BUILD_VERSION=1.0.32 BUILD_ID=2026-07-18-trace-01 GIT_SHA=unknown BUILD_TIME=2026-08-03T21:14:30.514Z");
        Log.i("PARTNER_BUILD", "DEVICE_MANUFACTURER=" + android.os.Build.MANUFACTURER + " DEVICE_MODEL=" + android.os.Build.MODEL + " SDK_INT=" + android.os.Build.VERSION.SDK_INT);


        super.onCreate(savedInstanceState);
        // urbanwash-webview-cache-bust-start
        WebView urbanwashWebView = getBridge().getWebView();
        if (urbanwashWebView != null) {
            urbanwashWebView.clearCache(true);
            urbanwashWebView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            urbanwashWebView.post(new Runnable() {
                @Override
                public void run() {
                    Log.i("PARTNER_BUILD", "WEBVIEW_CACHE_CLEARED_FORCE_RELOAD");
                    urbanwashWebView.reload();
                }
            });
        }
        // urbanwash-webview-cache-bust-end
    }

    // urbanwash-rzp-result-start
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        try {
            Checkout.handleRazorpayActivityResult(this, requestCode, resultCode, data);
        } catch (Throwable t) {
            Log.e("PARTNER_BUILD", "Razorpay activity result forwarding failed", t);
        }
    }
    // urbanwash-rzp-result-end
}
