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
        Log.d("CUSTOMER-PUSH-HANDSHAKE", "JS_REQUEST_RECEIVED");
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("fcm_diagnostics", Context.MODE_PRIVATE);
            
            String msgId = prefs.getString("last_fcm_message_id", null);
            long receivedAt = prefs.getLong("last_fcm_received_at", 0);
            String type = prefs.getString("last_fcm_type", "unknown");
            String title = prefs.getString("last_fcm_title", "");
            
            String notifId = prefs.getString("last_notif_posted_id", null);
            long postedAt = prefs.getLong("last_notif_posted_at", 0);

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
            Log.e("CUSTOMER-PUSH-HANDSHAKE", "Error reading diagnostics", e);
            call.reject("ERROR_READING_DIAGNOSTICS", e);
        }
    }
}
