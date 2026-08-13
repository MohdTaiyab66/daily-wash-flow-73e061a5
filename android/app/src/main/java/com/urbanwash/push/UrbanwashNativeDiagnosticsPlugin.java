package com.urbanwash.push;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UrbanwashNativeDiagnostics")
public class UrbanwashNativeDiagnosticsPlugin extends Plugin {

    @PluginMethod
    public void getLastFcmReceipt(PluginCall call) {
        Log.d("CUSTOMER-PUSH-HANDSHAKE", "JS_REQUEST_RECEIVED [BUILD: FCM-P0-FIREBASE-MERGE-05]");
        try {
            SharedPreferences diagPrefs = getContext().getSharedPreferences("fcm_diagnostics", Context.MODE_PRIVATE);
            
            String msgId = diagPrefs.getString("last_fcm_message_id", null);
            long receivedAt = diagPrefs.getLong("last_fcm_received_at", 0);
            String type = diagPrefs.getString("last_fcm_type", "unknown");
            String title = diagPrefs.getString("last_fcm_title", "");
            
            String notifId = diagPrefs.getString("last_notif_posted_id", null);
            long postedAt = diagPrefs.getLong("last_notif_posted_at", 0);

            // Fetch current native token for comparison
            SharedPreferences capPrefs = getContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String currentToken = capPrefs.getString("urbanwash.current_token", null);

            JSObject ret = new JSObject();
            ret.put("received", msgId != null);
            ret.put("messageId", msgId);
            ret.put("receivedAt", receivedAt > 0 ? String.valueOf(receivedAt) : null);
            ret.put("type", type);
            ret.put("title", title);
            ret.put("notifId", notifId);
            ret.put("postedAt", postedAt > 0 ? String.valueOf(postedAt) : null);
            ret.put("nativeTokenSuffix", currentToken != null && currentToken.length() > 8 
                ? currentToken.substring(currentToken.length() - 8) 
                : currentToken);
            ret.put("buildId", "FCM-P0-FIREBASE-MERGE-05");
            
            call.resolve(ret);
        } catch (Exception e) {
            Log.e("CUSTOMER-PUSH-HANDSHAKE", "Error reading diagnostics", e);
            call.reject("ERROR_READING_DIAGNOSTICS", e.getMessage());
        }
    }
}
