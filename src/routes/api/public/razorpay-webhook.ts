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

        const { data, error } = await (supabaseAdmin as any).rpc("activate_paid_booking", {
          p_booking_id: booking.id,
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_signature: signature,
          p_raw_payload: event,
        });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        // Instant partner dispatch: don't wait for the cron tick.
        try { await (supabaseAdmin as any).rpc("sweep_subscription_offers"); } catch {}
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
