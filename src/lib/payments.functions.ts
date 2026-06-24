import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac, timingSafeEqual } from "crypto";

type CreateOrderInput = { booking_id: string };
type VerifyPaymentInput = {
  booking_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, keySecret: string) {
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const received = Buffer.from(signature);
  const computed = Buffer.from(expected);
  return received.length === computed.length && timingSafeEqual(received, computed);
}

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateOrderInput) => input)
  .handler(async ({ data, context }) => {
    const config = getRazorpayConfig();
    if (!config) {
      throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first.");
    }

    const { data: booking, error } = await context.supabase
      .from("bookings")
      .select("id,user_id,total_amount,payment_status,razorpay_order_id,service_catalog:service_id(name,slug,service_type)")
      .eq("id", data.booking_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");
    if ((booking as any).payment_status === "paid") {
      return { alreadyPaid: true, bookingId: booking.id };
    }

    const amountPaise = Math.max(1, Math.round(Number((booking as any).total_amount || 0) * 100));
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `booking_${booking.id.slice(0, 24)}`,
        notes: {
          booking_id: booking.id,
          user_id: context.userId,
          service: (booking as any).service_catalog?.slug ?? "service",
        },
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new Error(payload?.error?.description || payload?.error?.reason || "Razorpay order creation failed");
    }

    const { error: updateError } = await context.supabase
      .from("bookings")
      .update({ razorpay_order_id: payload.id, updated_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("user_id", context.userId);
    if (updateError) throw new Error(updateError.message);

    await context.supabase.from("payments" as any).insert({
      booking_id: booking.id,
      user_id: context.userId,
      provider: "razorpay",
      provider_order_id: payload.id,
      amount: Number((booking as any).total_amount || 0),
      currency: "INR",
      status: "created",
      metadata: { order: payload, service: (booking as any).service_catalog?.slug ?? null },
    });

    return {
      keyId: config.keyId,
      orderId: payload.id as string,
      amount: payload.amount as number,
      currency: payload.currency as string,
      name: "Urban Wash",
      description: (booking as any).service_catalog?.name ?? "Urban Wash service",
      bookingId: booking.id as string,
    };
  });

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: VerifyPaymentInput) => input)
  .handler(async ({ data, context }) => {
    const config = getRazorpayConfig();
    if (!config) throw new Error("Razorpay is not configured");

    const ok = verifyRazorpaySignature(
      data.razorpay_order_id,
      data.razorpay_payment_id,
      data.razorpay_signature,
      config.keySecret,
    );
    if (!ok) throw new Error("Razorpay signature verification failed");

    const { data: booking, error } = await context.supabase
      .from("bookings")
      .select("id,user_id")
      .eq("id", data.booking_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");

    const { data: result, error: activateError } = await (context.supabase.rpc as any)("activate_paid_booking", {
      p_booking_id: data.booking_id,
      p_provider_order_id: data.razorpay_order_id,
      p_provider_payment_id: data.razorpay_payment_id,
      p_signature: data.razorpay_signature,
      p_raw_payload: {
        source: "checkout_handler",
        razorpay_order_id: data.razorpay_order_id,
        razorpay_payment_id: data.razorpay_payment_id,
      },
    });
    if (activateError) throw new Error(activateError.message);
    return result;
  });
