package com.urbanwash.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import android.util.Log

/**
 * Urban Wash marketplace push receiver.
 *
 * FCM v1 sends the offer as a data-only message. We post a MAX-importance,
 * full-screen-intent notification with Accept / Decline actions — the exact
 * shape Uber/Rapido use for ride requests. Works when the app is killed,
 * backgrounded, or on the lock screen.
 */
class UrbanwashMessagingService : FirebaseMessagingService() {

    companion object {
        // Bump this suffix when you change the custom sound. Android bakes
        // channel sound at creation and refuses to update it later.
        const val CHANNEL_OFFERS = "offers_v4"
        const val CHANNEL_ASSIGNMENTS = "assignments_v4"
        const val CHANNEL_GENERAL = "general"
        const val NOTIF_ID_OFFER = 42001
        const val ACTION_ACCEPT = "com.urbanwash.push.ACCEPT"
        const val ACTION_DECLINE = "com.urbanwash.push.DECLINE"
        const val EXTRA_TOKEN = "action_token"
        const val EXTRA_BROADCAST = "broadcast_id"
        const val EXTRA_OFFER = "offer_id"

        // Every partner-side assignment/offer push type must route through the
        // unified heads-up path so foreground / background / killed all behave
        // identically. Keep this list in sync with the backend dispatcher
        // (src/routes/api/public/hooks/notification-push.ts).
        val ASSIGNMENT_TYPES = setOf(
            "new_assignment",
            "new_assignments",
            "assignment_created",
            "assignment_updated",
            "partner_assigned",
            "daily_shine",
            "new_booking",
            "new_customers",
            "route_updated"
        )
    }


    override fun onNewToken(token: String) {
        // The JS layer (fcm.ts → tokenReceived listener) upserts push_tokens.
        super.onNewToken(token)
    }

    override fun onMessageReceived(msg: RemoteMessage) {
    Log.d("UW_PUSH", "onMessageReceived: ${msg.data}")

    val data = msg.data
    val type = data["type"] ?: return
        when {
            type == "marketplace_offer" ||
            type == "daily_shine_offer" -> {
                ensureUrgentChannel(CHANNEL_OFFERS, "New customer offers",
                    "Uber-style heads-up for new Daily Shine customers")
                postOffer(data, isUpdate = false)
            }
            type == "marketplace_offer_update" -> {
                ensureUrgentChannel(CHANNEL_OFFERS, "New customer offers",
                    "Uber-style heads-up for new Daily Shine customers")
                postOffer(data, isUpdate = true)
            }
            ASSIGNMENT_TYPES.contains(type) -> {
                ensureUrgentChannel(CHANNEL_ASSIGNMENTS, "New assignments",
                    "New customer assignments — wake screen with heads-up")
                postAssignment(data)
            }
            else -> postGeneric(msg)
        }
    }

    /**
     * Android 14 (API 34) only auto-grants USE_FULL_SCREEN_INTENT to calling /
     * alarm apps. For everyone else the permission is denied by default, and a
     * notification that carries a full-screen intent can be swallowed on the
     * lock screen (sound + vibration fire, nothing is drawn) instead of being
     * demoted to a normal heads-up. Only attach the FSI when it is actually
     * usable; otherwise post a plain high-importance notification.
     */
    private fun canUseFullScreen(): Boolean {
        if (Build.VERSION.SDK_INT < 34) return true
        return runCatching {
            getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() == true
        }.getOrDefault(false)
    }

    private fun ensureUrgentChannel(id: String, name: String, desc: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(id) != null) return



        val soundUri: Uri = runCatching {
            val resId = resources.getIdentifier("uw_offer", "raw", packageName)
            if (resId != 0) Uri.parse("android.resource://$packageName/$resId")
            else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        }.getOrElse { RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) }

        val audioAttrs = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build()

        val ch = NotificationChannel(
            id,
            name,
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = desc
            enableLights(true)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 800)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            setBypassDnd(true)
            setShowBadge(true)
            setSound(soundUri, audioAttrs)
        }
        nm.createNotificationChannel(ch)
    }


    private fun postOffer(data: Map<String, String>, isUpdate: Boolean) {
        val ctx: Context = applicationContext
        val token = data[EXTRA_TOKEN] ?: return
        val broadcastId = data[EXTRA_BROADCAST] ?: return
        val offerId = data[EXTRA_OFFER] ?: return

        val title = data["title"] ?: "🚗 New Daily Shine Customer"
        val body = data["body"] ?: "Tap to view — 90s to accept"
        val bigBody = buildString {
            appendLine(body)
            data["vehicle"]?.let { appendLine("🚙 $it") }
            data["area"]?.let { appendLine("📍 $it") }
            data["distance"]?.let { appendLine("📏 $it from your route") }
            data["incentive"]?.let { appendLine("💰 $it") }
            data["working_days"]?.let { appendLine("📅 $it working days") }
        }.trim()

        // Tap → open app deep-link. Fires only if the user taps the body.
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("deep_link", "/app")
        }
        val contentPI = PendingIntent.getActivity(
            ctx, broadcastId.hashCode(), launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val fullScreenPI = contentPI

        val acceptPI = PendingIntent.getBroadcast(
            ctx, ("accept:$broadcastId").hashCode(),
            Intent(ctx, OfferActionReceiver::class.java).apply {
                action = ACTION_ACCEPT
                putExtra(EXTRA_TOKEN, token)
                putExtra(EXTRA_BROADCAST, broadcastId)
                putExtra(EXTRA_OFFER, offerId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val declinePI = PendingIntent.getBroadcast(
            ctx, ("decline:$broadcastId").hashCode(),
            Intent(ctx, OfferActionReceiver::class.java).apply {
                action = ACTION_DECLINE
                putExtra(EXTRA_TOKEN, token)
                putExtra(EXTRA_BROADCAST, broadcastId)
                putExtra(EXTRA_OFFER, offerId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconRes = resources.getIdentifier(
            "ic_stat_notify", "drawable", packageName
        ).let { if (it != 0) it else applicationInfo.icon }

        val builder = NotificationCompat.Builder(ctx, CHANNEL_OFFERS)
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(bigBody))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(contentPI)
            .setTimeoutAfter(95_000L)
            .addAction(0, "Accept", acceptPI)
            .addAction(0, "Decline", declinePI)
            // Silent updates should NOT re-alert. Fresh offers get a full-screen
            // intent only when the OS actually allows one (see canUseFullScreen).
            .setOnlyAlertOnce(isUpdate)
            .apply { if (!isUpdate && canUseFullScreen()) setFullScreenIntent(fullScreenPI, true) }

        // Notification id = broadcast id → subsequent updates replace the same
        // heads-up rather than stacking a fresh one.
Log.d("UW_PUSH", "Posting notification id=${broadcastId.hashCode()}")
Log.d("UW_PUSH", "CHANNEL=" + CHANNEL_OFFERS)
        NotificationManagerCompat.from(ctx).notify(broadcastId.hashCode(), builder.build())
    }

    /**
     * Unified partner assignment heads-up. Used for every backend push whose
     * `data.type` appears in ASSIGNMENT_TYPES, regardless of the originating
     * service (route dispatch, marketplace acceptance, DAR, add-ons, etc.).
     *
     * No accept/decline actions — assignments are already committed to the
     * partner. Tap the notification to deep-link into the assignment.
     */
    private fun postAssignment(data: Map<String, String>) {
        val ctx: Context = applicationContext
        val title = data["title"] ?: "🚗 New assignment"
        val body = data["body"] ?: "Tap to view your new customer"
        val link = data["link"]?.takeIf { it.startsWith("/") } ?: "/app/assignments"
        val notifKey = data["assignment_id"] ?: data["service_id"] ?: data["offer_id"] ?: link

        val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("deep_link", link)
        }
        val contentPI = PendingIntent.getActivity(
            ctx, notifKey.hashCode(), launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val iconRes = resources.getIdentifier(
            "ic_stat_notify", "drawable", packageName
        ).let { if (it != 0) it else applicationInfo.icon }

        val builder = NotificationCompat.Builder(ctx, CHANNEL_ASSIGNMENTS)
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentPI)
            .setFullScreenIntent(contentPI, true)
Log.d("UW_PUSH", "CHANNEL=" + CHANNEL_ASSIGNMENTS)

NotificationManagerCompat.from(ctx)
    .notify(notifKey.hashCode(), builder.build())
}
    private fun postGeneric(msg: RemoteMessage) {
        val n = msg.notification ?: return
        val builder = NotificationCompat.Builder(applicationContext, CHANNEL_GENERAL)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(n.title ?: "Urban Wash")
            .setContentText(n.body ?: "")
.setDefaults(NotificationCompat.DEFAULT_ALL)
.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        NotificationManagerCompat.from(applicationContext)
            .notify(System.currentTimeMillis().toInt(), builder.build())
    }

}
