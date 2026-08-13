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
    public void getNativeInfo(PluginCall call) {
        Log.d("CUSTOMER-PUSH-HANDSHAKE", "getNativeInfo invoked [BUILD: FCM-P0-NATIVE-FCM-RECEIPT-06]");
        try {
            SharedPreferences capPrefs = getContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String currentToken = capPrefs.getString("urbanwash.current_token", null);

            JSObject ret = new JSObject();
            ret.put("nativeToken", currentToken);
            ret.put("tokenTail", currentToken != null && currentToken.length() > 8 
                ? currentToken.substring(currentToken.length() - 8) 
                : currentToken);
            ret.put("packageName", getContext().getPackageName());
            ret.put("buildId", "FCM-P0-NATIVE-FCM-RECEIPT-06");
            
            // Firebase identification (safe to expose in diag panel)
            try {
                com.google.firebase.FirebaseOptions options = com.google.firebase.FirebaseApp.getInstance().getOptions();
                ret.put("senderId", options.getGcmSenderId());
                ret.put("projectId", options.getProjectId());
                ret.put("googleAppId", options.getApplicationId());
            } catch (Exception fe) {
                ret.put("firebaseError", fe.getMessage());
            }

            call.resolve(ret);
        } catch (Exception e) {
            Log.e("CUSTOMER-PUSH-HANDSHAKE", "getNativeInfo failed", e);
            call.reject("ERROR_GETTING_NATIVE_INFO", e.getMessage());
        }
    }

    @PluginMethod
    public void getLastFcmReceipt(PluginCall call) {
        Log.d("CUSTOMER-PUSH-HANDSHAKE", "getLastFcmReceipt invoked");
        try {
            SharedPreferences diagPrefs = getContext().getSharedPreferences("fcm_diagnostics", Context.MODE_PRIVATE);
            
            String msgId = diagPrefs.getString("last_fcm_message_id", null);
            long receivedAt = diagPrefs.getLong("last_fcm_received_at", 0);
            String type = diagPrefs.getString("last_fcm_type", "unknown");
            String title = diagPrefs.getString("last_fcm_title", "");
            
            String notifId = diagPrefs.getString("last_notif_posted_id", null);
            long postedAt = diagPrefs.getLong("last_notif_posted_at", 0);

            JSObject ret = new JSObject();
            ret.put("received", msgId != null);
            ret.put("messageId", msgId);
            ret.put("receivedAt", receivedAt > 0 ? String.valueOf(receivedAt) : null);
            ret.put("type", type);
            ret.put("title", title);
            ret.put("notifId", notifId);
            ret.put("postedAt", postedAt > 0 ? String.valueOf(postedAt) : null);
            
            call.resolve(ret);
        } catch (Exception e) {
            Log.e("CUSTOMER-PUSH-HANDSHAKE", "getLastFcmReceipt failed", e);
            call.reject("ERROR_READING_DIAGNOSTICS", e.getMessage());
        }
    }
}
