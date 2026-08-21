import { createHmac, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

function verifyWebhook(body: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret missing", { status: 500 });

        const body = await request.text();
        const signature = request.headers.get("x-razorpay-signature");
        if (!verifyWebhook(body, signature, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as any;
        const eventType = event?.event as string | undefined;
        const payment = event?.payload?.payment?.entity;
        const orderId = payment?.order_id as string | undefined;
        const paymentId = payment?.id as string | undefined;
        if (!orderId || !paymentId) return Response.json({ ok: true, ignored: true });

        // Gate activation strictly on captured payments. Razorpay also fires
        // `payment.authorized`, `payment.failed`, `refund.*`, etc. — without
        // this gate a failed-payment webhook would still activate the
        // booking. Only `payment.captured` (or `order.paid`, which implies
        // captured) may trigger activation. Everything else is logged and
        // acknowledged so Razorpay stops retrying.
        const isCaptureEvent = eventType === "payment.captured" || eventType === "order.paid";
        const isCapturedStatus = payment?.status === "captured";
        if (!isCaptureEvent || !isCapturedStatus) {
          return Response.json({
            ok: true,
            ignored: true,
            reason: "not_captured",
            event: eventType,
            payment_status: payment?.status,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: booking, error: bookingError } = await supabaseAdmin
          .from("bookings")
          .select("id")
          .eq("razorpay_order_id", orderId)
          .maybeSingle();
        if (bookingError) return Response.json({ ok: false, error: bookingError.message }, { status: 500 });
        if (!booking) return Response.json({ ok: true, ignored: true, reason: "booking_not_found" });

        console.log(`[ADMIN-BOOKING-E2E] Activating booking_id: ${booking.id} for order: ${orderId}`);
        const { data, error } = await (supabaseAdmin as any).rpc("activate_paid_booking", {
          p_booking_id: booking.id,
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_signature: signature,
          p_raw_payload: event,
        });

        if (error) {
          console.error(`[PAYMENT-E2E:06] ACTIVATION_RESULT error=${error.message} booking_id=${booking.id}`);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        
        console.log(`[PAYMENT-E2E:06] ACTIVATION_SUCCESS booking_id=${booking.id}`);
        
        // Immediate admin notification and system synchronization
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // Verify customer profile exists for the user
          const { data: bookingDetails } = await supabaseAdmin.from("bookings").select("user_id").eq("id", booking.id).single();
          const { data: customer } = await supabaseAdmin.from("customers").select("full_name, area").eq("id", bookingDetails?.user_id).maybeSingle();
          
          const title = "DAILY SHINE PAID";
          const body = `New Daily Shine booking for ${customer?.full_name || 'Customer'} in ${customer?.area || 'unknown area'}.`;
          
          console.log(`[ADMIN-BOOKING-E2E] Creating admin notification for booking_id: ${booking.id}`);
          
          await supabaseAdmin.from("admin_notifications").insert({
            category: "bookings",
            title,
            body,
            metadata: { 
              booking_id: booking.id,
              customer_name: customer?.full_name,
              area: customer?.area,
              amount: payment?.amount ? payment.amount / 100 : 0
            },
            link: `/admin/assign-booking/${booking.id}`
          });
          
          const { dispatchAdminNotifications } = await import("@/lib/push/dispatch.server");
          await dispatchAdminNotifications();
          console.log(`[ADMIN-BOOKING-E2E] Admin notification dispatched for booking_id: ${booking.id}`);
        } catch (e) { 
          console.error("[ADMIN-BOOKING-E2E] admin alert failed", e); 
        }
        
        return Response.json({ ok: true, result: data });
        
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
