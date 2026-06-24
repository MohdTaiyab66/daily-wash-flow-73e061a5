import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orderInput = z.object({ bookingId: z.string().uuid() });
const verifyInput = z.object({
  bookingId: z.string().uuid(),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

function requireRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured");
  }
  return { keyId, keySecret };
}

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { keyId, keySecret } = requireRazorpayConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id,user_id,total_amount,payment_status,razorpay_order_id,service_catalog:service_id(service_type,name)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking || booking.user_id !== context.userId) throw new Error("Booking not found");
    if (booking.payment_status === "paid") throw new Error("Booking is already paid");

    const amountPaise = Math.round(Number(booking.total_amount ?? 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) throw new Error("Invalid booking amount");

    const existingOrderId = booking.razorpay_order_id as string | null;
    if (existingOrderId) {
      return { keyId, orderId: existingOrderId, amount: amountPaise, currency: "INR", bookingId: data.bookingId };
    }

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `uw_${data.bookingId.slice(0, 24)}`,
        notes: { booking_id: data.bookingId, user_id: context.userId },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.error?.description || "Could not create Razorpay order");
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ razorpay_order_id: payload.id, updated_at: new Date().toISOString() })
      .eq("id", data.bookingId);
    if (updateError) throw new Error(updateError.message);

    const paymentSeed = {
        booking_id: data.bookingId,
        user_id: context.userId,
        provider: "razorpay",
        provider_order_id: payload.id,
        amount: Number(booking.total_amount ?? 0),
        currency: "INR",
        status: "created",
        metadata: { service_type: (booking.service_catalog as any)?.service_type ?? null, razorpay_order: payload },
      } as any;
    const { error: paymentInsertError } = await supabaseAdmin.from("payments").insert(paymentSeed);
    if (paymentInsertError?.code === "23505") {
      await supabaseAdmin.from("payments").update(paymentSeed).eq("booking_id", data.bookingId).eq("provider", "razorpay");
    } else if (paymentInsertError) {
      throw new Error(paymentInsertError.message);
    }

    return { keyId, orderId: payload.id as string, amount: amountPaise, currency: "INR", bookingId: data.bookingId };
  });

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => verifyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { keyId, keySecret } = requireRazorpayConfig();
    const { createHmac } = await import("crypto");
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");
    if (expectedSignature !== data.razorpaySignature) {
      throw new Error("Payment verification failed");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id,user_id,total_amount")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking || booking.user_id !== context.userId) throw new Error("Booking not found");

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${data.razorpayPaymentId}`, {
      headers: { Authorization: authHeader },
    });
    const payment = (await paymentResponse.json().catch(() => ({}))) as any;
    if (!paymentResponse.ok) throw new Error(payment?.error?.description || "Could not verify Razorpay payment");

    const amountPaise = Math.round(Number(booking.total_amount ?? 0) * 100);
    if (payment.status === "authorized") {
      const captureResponse = await fetch(`https://api.razorpay.com/v1/payments/${data.razorpayPaymentId}/capture`, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
      });
      const capture = (await captureResponse.json().catch(() => ({}))) as any;
      if (!captureResponse.ok) throw new Error(capture?.error?.description || "Could not capture Razorpay payment");
    } else if (payment.status !== "captured") {
      throw new Error(`Razorpay payment is ${payment.status ?? "not captured"}`);
    }

    const { data: result, error } = await (context.supabase as any).rpc("activate_paid_booking", {
      p_booking_id: data.bookingId,
      p_provider_order_id: data.razorpayOrderId,
      p_provider_payment_id: data.razorpayPaymentId,
      p_signature: data.razorpaySignature,
      p_raw_payload: {
        source: "checkout_callback",
        razorpay_order_id: data.razorpayOrderId,
        razorpay_payment_id: data.razorpayPaymentId,
        payment_status: payment.status,
      },
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; booking_id: string; payment_id: string; subscription_id?: string; queue_id?: string };
  });
