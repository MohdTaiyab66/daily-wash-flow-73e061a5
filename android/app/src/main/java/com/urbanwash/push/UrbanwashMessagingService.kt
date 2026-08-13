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
import android.os.Handler
import android.os.Looper
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
            "daily_shine_offer",
            "marketplace_offer",
            "marketplace_offer_update",
            "new_booking",
            "new_customers",
            "route_updated",
            "subscription_activated",
            "booking_confirmed",
            "partner_accepted",
            "service_started",
            "service_completed",
            "payment_success",
            "payment_failed",
            "completed",
            "vehicle_unavailable",
            "service_unavailable",
            "dirty_vehicle",
            "vehicle_dirty"
        )

    }


    override fun onNewToken(token: String) {
        // The JS layer (fcm.ts → tokenReceived listener) upserts push_tokens.
        super.onNewToken(token)
    }

    override fun onMessageReceived(msg: RemoteMessage) {
        val data = msg.data
        val type = data["type"] ?: ""
        val msgId = msg.messageId ?: "unknown"

        // [CUSTOMER-PUSH-NATIVE:01] MESSAGE_RECEIVED
        Log.d("CUSTOMER-PUSH-NATIVE", "01 MESSAGE_RECEIVED msgId=$msgId from=${msg.from} sentTime=${msg.sentTime} ttl=${msg.ttl} type=$type data=$data")
        
        // Persist receipt for handshake with JS forensic panel
        try {
            val prefs = getSharedPreferences("fcm_diagnostics", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString("last_fcm_message_id", msgId)
                putLong("last_fcm_received_at", System.currentTimeMillis())
                putString("last_fcm_type", type)
                putString("last_fcm_title", data["title"] ?: msg.notification?.title)
                putString("last_fcm_body", data["body"] ?: msg.notification?.body)
                apply()
            }
        } catch (e: Exception) {
            Log.e("CUSTOMER-PUSH-NATIVE", "Failed to persist diagnostic receipt", e)
        }

        Log.d("UW_AUDIT", "1_fcm_received msgId=$msgId from=${msg.from} " +
            "collapseKey=${msg.collapseKey} priority=${msg.priority}/${msg.originalPriority} " +
            "hasNotifBlock=${msg.notification != null} " +
            "notifChannel=${msg.notification?.channelId} notifTag=${msg.notification?.tag} " +
            "sentTime=${msg.sentTime} ttl=${msg.ttl}")

        if (type.isEmpty()) {
            Log.w("UW_AUDIT", "2_branch=DROPPED_NO_TYPE data=$data")
            return
        }

        // [CUSTOMER-PUSH-NATIVE:02] PAYLOAD_PARSED
        Log.d("CUSTOMER-PUSH-NATIVE", "02 PAYLOAD_PARSED type=$type title=${data["title"]} body=${data["body"]}")

        when {
            type == "marketplace_offer" ||
            type == "daily_shine_offer" -> {
                Log.d("UW_AUDIT", "2_branch=offer_new type=$type")
                ensureUrgentChannel(CHANNEL_OFFERS, "New customer offers",
                    "Uber-style heads-up for new Daily Shine customers")
                postOffer(data, isUpdate = false)
            }
            type == "marketplace_offer_update" -> {
                Log.d("UW_AUDIT", "2_branch=offer_update type=$type")
                ensureUrgentChannel(CHANNEL_OFFERS, "New customer offers",
                    "Uber-style heads-up for new Daily Shine customers")
                postOffer(data, isUpdate = true)
            }
            ASSIGNMENT_TYPES.contains(type) || type == "test_notification" -> {
                // [CUSTOMER-PUSH-NATIVE:03] CHANNEL_SELECTED
                Log.d("CUSTOMER-PUSH-NATIVE", "03 CHANNEL_SELECTED channelId=$CHANNEL_ASSIGNMENTS")
                Log.d("UW_AUDIT", "2_branch=assignment type=$type")
                ensureUrgentChannel(CHANNEL_ASSIGNMENTS, "New assignments",
                    "New customer assignments — wake screen with heads-up")
                postAssignment(data)
            }
            else -> {
                Log.w("CUSTOMER-PUSH-NATIVE", "E2 EVENT_UNKNOWN type=$type")
                Log.w("UW_AUDIT", "2_branch=generic type=$type")
                postGeneric(msg)
            }
        }
    }

    /**
     * Audit helper. Logs the exact notification identity immediately before and
     * after notify(), then re-checks the system's active list at +1s and +5s so
     * a notification that is posted and then silently removed by the framework,
     * the OEM, or another component is provable from logcat alone.
     */
    private fun auditNotify(
        nm: NotificationManagerCompat,
        id: Int,
        tag: String?,
        channelId: String,
        idSource: String,
        notification: android.app.Notification,
    ) {
        val sysNm = getSystemService(NotificationManager::class.java)
        val ch = runCatching { sysNm?.getNotificationChannel(channelId) }.getOrNull()
        Log.d("UW_AUDIT", "3_pre_notify id=$id tag=$tag channel=$channelId idSource=$idSource " +
            "channelExists=${ch != null} importance=${ch?.importance} " +
            "sound=${ch?.sound} lockVis=${ch?.lockscreenVisibility} " +
            "fsiAllowed=${canUseFullScreen()} " +
            "notifEnabled=${nm.areNotificationsEnabled()} " +
            "hasFsi=${notification.fullScreenIntent != null} flags=${notification.flags}")
        try {
            nm.notify(id, notification)
            Log.d("UW_AUDIT", "4_post_notify_ok id=$id")
        } catch (e: Throwable) {
            Log.e("UW_AUDIT", "4_post_notify_threw id=$id", e)
            return
        }
        val probe = { at: String ->
            val active = runCatching {
                sysNm?.activeNotifications?.map { it.id } ?: emptyList()
            }.getOrDefault(emptyList())
            val alive = active.contains(id)
            Log.d("UW_AUDIT", "5_probe_$at id=$id alive=$alive active=$active")
            if (!alive) Log.e("UW_AUDIT", "5_DISAPPEARED_$at id=$id channel=$channelId")
        }
        val h = Handler(Looper.getMainLooper())
        h.post { probe("t0") }
        h.postDelayed({ probe("t1s") }, 1_000L)
        h.postDelayed({ probe("t5s") }, 5_000L)
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
        
        val existing = nm.getNotificationChannel(id)
        if (existing != null) {
            // [CUSTOMER-PUSH-NATIVE:CHANNEL]
            Log.d("CUSTOMER-PUSH-NATIVE", "CHANNEL_INFO ID=${existing.id} IMPORTANCE=${existing.importance} ENABLED=${nm.areNotificationsEnabled()}")
            if (existing.importance < NotificationManager.IMPORTANCE_HIGH) {
                Log.w("CUSTOMER-PUSH-NATIVE", "CHANNEL_WARNING ID=$id has LOW importance (${existing.importance}) but needs HIGH")
            }
            return
        }

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
        Log.d("CUSTOMER-PUSH-NATIVE", "CHANNEL_CREATED ID=$id IMPORTANCE=HIGH")
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
Log.d("UW_AUDIT", "2b_ids broadcastId=$broadcastId offerId=$offerId " +
    "notifId=${broadcastId.hashCode()} offerIdHash=${offerId.hashCode()} " +
    "progressIdHash=${("progress:" + offerId).hashCode()} doneIdHash=${("done:" + offerId).hashCode()} " +
    "isUpdate=$isUpdate sdk=${Build.VERSION.SDK_INT} canUseFullScreen=${canUseFullScreen()}")
        auditNotify(
            NotificationManagerCompat.from(ctx),
            broadcastId.hashCode(),
            null,
            CHANNEL_OFFERS,
            "broadcast_id",
            builder.build(),
        )
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
            .apply { if (canUseFullScreen()) setFullScreenIntent(contentPI, true) }
Log.d("UW_PUSH", "CHANNEL=" + CHANNEL_ASSIGNMENTS + " fsi=" + canUseFullScreen())
Log.d("UW_AUDIT", "2b_ids notifKey=$notifKey notifId=${notifKey.hashCode()} link=$link")

// [CUSTOMER-PUSH-NATIVE:04] NOTIFICATION_POST_ATTEMPT
Log.d("CUSTOMER-PUSH-NATIVE", "04 NOTIFICATION_POST_ATTEMPT notifKey=$notifKey notifId=${notifKey.hashCode()} type=${data["type"]}")

auditNotify(
    NotificationManagerCompat.from(ctx),
    notifKey.hashCode(),
    null,
    CHANNEL_ASSIGNMENTS,
    "assignment_id|service_id|offer_id|link",
    builder.build(),
)
// [CUSTOMER-PUSH-NATIVE:05] NOTIFICATION_POST_SUCCESS
Log.d("CUSTOMER-PUSH-NATIVE", "05 NOTIFICATION_POST_SUCCESS id=${notifKey.hashCode()}")

try {
    val prefs = getSharedPreferences("fcm_diagnostics", Context.MODE_PRIVATE)
    prefs.edit().apply {
        putString("last_notif_posted_id", notifKey.hashCode().toString())
        putLong("last_notif_posted_at", System.currentTimeMillis())
        putString("last_notif_channel", CHANNEL_ASSIGNMENTS)
        apply()
    }
} catch (e: Exception) {
    Log.e("CUSTOMER-PUSH-NATIVE", "Failed to persist notif diagnostic receipt", e)
}
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
