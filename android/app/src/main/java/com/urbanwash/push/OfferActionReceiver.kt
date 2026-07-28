package com.urbanwash.push

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Handles Accept / Decline taps from the marketplace notification.
 *
 * Fires POST /api/public/marketplace/offer-action with the signed action_token
 * from the FCM data payload. No app open required — perfect for lock-screen use.
 */
class OfferActionReceiver : BroadcastReceiver() {

    companion object {
        // Same base URL as the app. Both are served from the Lovable domain,
        // no CORS / auth headers needed for /api/public/*.
        private const val ACTION_URL =
            "https://daily-wash-flow.lovable.app/api/public/marketplace/offer-action"
    }
    override fun onReceive(ctx: Context, intent: Intent) {

    Log.d("UW_ACTION", "Received action = ${intent.action}")

    Log.d(
        "UW_ACTION",
        "token=${intent.getStringExtra(UrbanwashMessagingService.EXTRA_TOKEN)} " +
        "offer=${intent.getStringExtra(UrbanwashMessagingService.EXTRA_OFFER)} " +
        "broadcast=${intent.getStringExtra(UrbanwashMessagingService.EXTRA_BROADCAST)}"
    )

    val token = intent.getStringExtra(UrbanwashMessagingService.EXTRA_TOKEN) ?: run {
        Log.e("UW_ACTION", "Missing action token")
        return
    }

    val offerId = intent.getStringExtra(UrbanwashMessagingService.EXTRA_OFFER) ?: run {
        Log.e("UW_ACTION", "Missing offer id")
        return
    }

    Log.d("UW_ACTION", "Passed validation")

    val action = when (intent.action) {
        UrbanwashMessagingService.ACTION_ACCEPT -> "accept"
        UrbanwashMessagingService.ACTION_DECLINE -> "decline"
        else -> return
    }

        // Dismiss the notification immediately so the partner gets instant feedback.
        NotificationManagerCompat.from(ctx).cancel(offerId.hashCode())

        // Show a transient "posting…" heads-up so the user sees something happened.
        val progress = NotificationCompat.Builder(ctx, UrbanwashMessagingService.CHANNEL_GENERAL)
            .setSmallIcon(ctx.applicationInfo.icon)
            .setContentTitle(if (action == "accept") "Accepting…" else "Declining…")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
        val nm = NotificationManagerCompat.from(ctx)
        val progressId = ("progress:$offerId").hashCode()
        try { nm.notify(progressId, progress) } catch (_: SecurityException) {}

        thread(start = true, isDaemon = true) {
            val body = JSONObject().apply {
                put("token", token)
                put("action", action)
            }.toString()

            val (ok, message) = post(ACTION_URL, body)
            Log.d("UW_ACTION", "ok=$ok message=$message")
            nm.cancel(progressId)

            val finalTitle: String
            val finalText: String
            when {
                ok && action == "accept" -> {
                    finalTitle = "✅ Customer accepted"
                    finalText = "Added to Today's Route."
                }
                ok -> {
                    finalTitle = "Declined"
                    finalText = "You will not receive this offer again."
                }
                message == "already_taken" -> {
                    finalTitle = "Another partner was faster"
                    finalText = "Better luck on the next one."
                }
                message == "already_used" -> {
                    finalTitle = "Already responded"
                    finalText = ""
                }
                message == "expired" -> {
                    finalTitle = "Offer expired"
                    finalText = "The countdown ran out."
                }
                else -> {
                    finalTitle = "Could not $action"
                    finalText = "Open the app and try again."
                }
            }

            Handler(Looper.getMainLooper()).post {
                val final = NotificationCompat.Builder(ctx, UrbanwashMessagingService.CHANNEL_GENERAL)
                    .setSmallIcon(ctx.applicationInfo.icon)
                    .setContentTitle(finalTitle)
                    .setContentText(finalText)
                    .setAutoCancel(true)
                    .setTimeoutAfter(4_000L)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .build()
                try { nm.notify(("done:$offerId").hashCode(), final) } catch (_: SecurityException) {}
                if (!ok) {
                    runCatching { Toast.makeText(ctx, finalTitle, Toast.LENGTH_LONG).show() }
                }
            }
        }
    }

    private fun post(url: String, body: String): Pair<Boolean, String?> {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            val code = conn.responseCode
            Log.d("UW_ACTION", "HTTP code = $code")
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val respText = stream?.let { BufferedReader(InputStreamReader(it)).use { r -> r.readText() } } ?: ""
            Log.d("UW_ACTION", "Response = $respText")
            val json = runCatching { JSONObject(respText) }.getOrNull()
            val ok = json?.optBoolean("ok", false) ?: (code in 200..299)
            val reason = json?.optString("reason", "")?.takeIf { it.isNotEmpty() }
            ok to reason
        } catch (e: Exception) {
    Log.e("UW_ACTION", "Offer action failed", e)
    false to e.message
} finally {
            conn?.disconnect()
        }
    }
}
