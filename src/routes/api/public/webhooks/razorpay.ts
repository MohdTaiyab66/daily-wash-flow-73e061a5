import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function safeCompareHex(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return Response.json({ ok: false, error: "Webhook not configured" }, { status: 500 });

        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        if (!signature || !safeCompareHex(signature, expected)) {
          return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
        }

        const event = JSON.parse(body) as any;
        const payment = event?.payload?.payment?.entity;
        const order = event?.payload?.order?.entity;
        const orderId = payment?.order_id ?? order?.id ?? null;
        const paymentId = payment?.id ?? null;
        const bookingId = payment?.notes?.booking_id ?? order?.notes?.booking_id ?? null;

        if (!bookingId || !orderId) {
          return Response.json({ ok: true, ignored: true, reason: "No booking id" });
        }

        const payableEvents = new Set(["payment.captured", "order.paid"]);
        if (!payableEvents.has(event.event)) {
          return Response.json({ ok: true, ignored: true, event: event.event });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin.rpc as any)("activate_paid_booking", {
          p_booking_id: bookingId,
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_signature: signature,
          p_raw_payload: event,
        });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
