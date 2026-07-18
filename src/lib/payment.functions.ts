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

const logAttemptInput = z.object({
  bookingId: z.string().uuid(),
  channel: z.enum(["native", "web", "unknown"]),
  outcome: z.enum(["started", "success", "failure", "cancelled", "retry", "timeout"]),
  attemptNo: z.number().int().min(1).max(50).optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(1000).optional(),
  providerOrderId: z.string().max(120).optional(),
  providerPaymentId: z.string().max(120).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const statusInput = z.object({ bookingId: z.string().uuid() });
const userAttemptsInput = z.object({
  userId: z.string().uuid().optional(),
  phone: z.string().min(6).max(20).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).refine((v) => !!v.userId || !!v.phone, { message: "userId or phone is required" });


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
      .select("id,user_id,vehicle_id,total_amount,payment_status,razorpay_order_id,service_catalog:service_id(service_type,category,name)")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking || booking.user_id !== context.userId) throw new Error("Booking not found");
    if (booking.payment_status === "paid") throw new Error("Booking is already paid");

    // P0-DUP-01: Block Razorpay order creation if the vehicle already has an
    // open Daily Shine subscription. RPC has the same check; this guard also
    // catches retried payment attempts for pre-existing pending bookings.
    const svc = booking.service_catalog as any;
    const isSubscription = svc?.service_type === "subscription" || svc?.category === "subscription";
    if (isSubscription && (booking as any).vehicle_id) {
      const { data: openSub } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("vehicle_id", (booking as any).vehicle_id)
        .in("status", ["active", "awaiting_partner_assignment", "assigned"])
        .neq("booking_id", data.bookingId)
        .limit(1)
        .maybeSingle();
      if (openSub) {
        await supabaseAdmin.from("subscription_block_log").insert({
          user_id: context.userId,
          vehicle_id: (booking as any).vehicle_id,
          service_id: (booking as any).service_id ?? null,
          existing_subscription_id: (openSub as any).id,
          source: "razorpay_order",
          reason: "duplicate_active_subscription",
          meta: { booking_id: data.bookingId },
        });
        throw new Error("This vehicle already has an active Daily Shine subscription.");
      }
    }


    const amountPaise = Math.round(Number(booking.total_amount ?? 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) throw new Error("Invalid booking amount");

    const existingOrderId = booking.razorpay_order_id as string | null;
    if (existingOrderId) {
      return { keyId, orderId: existingOrderId, amount: amountPaise, currency: "INR", bookingId: data.bookingId };
    }

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const logAttempt = async (row: Record<string, unknown>) => {
      try {
        await supabaseAdmin.from("payment_attempts").insert({
          booking_id: data.bookingId,
          user_id: context.userId,
          provider: "razorpay",
          provider_order_id: data.razorpayOrderId,
          provider_payment_id: data.razorpayPaymentId,
          channel: "unknown",
          ...row,
        } as any);
      } catch (e) {
        console.warn("[payment] attempt-log write failed (non-fatal)", e);
      }
    };

    try {
      const { keyId, keySecret } = requireRazorpayConfig();
      const { createHmac } = await import("crypto");
      const expectedSignature = createHmac("sha256", keySecret)
        .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
        .digest("hex");
      if (expectedSignature !== data.razorpaySignature) {
        throw new Error("Payment verification failed");
      }

      const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id,user_id,total_amount")
        .eq("id", data.bookingId)
        .maybeSingle();
      if (bookingError) throw new Error(bookingError.message);
      if (!booking || booking.user_id !== context.userId) throw new Error("Booking not found");

      const authHeader = `Basic ${btoa(`${keyId}:${keySecret}`)}`;
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

      // Phase 2 shadow: fire the new orchestrator in parallel with legacy.
      // Never blocks or alters production activation.
      try {
        await (context.supabase as any).rpc("ds_on_payment_verified", { p_booking_id: data.bookingId });
      } catch (e) {
        console.warn("[ds-shadow] ds_on_payment_verified failed (non-fatal)", e);
      }

      // Instant partner dispatch: sweep pending offers immediately so the newly
      // paid subscription reaches partners without waiting for the cron tick.
      try {
        await (supabaseAdmin as any).rpc("sweep_subscription_offers");
      } catch (e) {
        console.warn("[payment] sweep_subscription_offers failed (non-fatal)", e);
      }

      await logAttempt({ outcome: "success", metadata: { razorpay_status: payment.status } });
      return result as { ok: boolean; booking_id: string; payment_id: string; subscription_id?: string; queue_id?: string };
    } catch (err: any) {
      await logAttempt({
        outcome: "failure",
        error_code: "verify_failed",
        error_message: String(err?.message || err).slice(0, 1000),
      });
      throw err;
    }
  });

/**
 * Best-effort log of a payment attempt from the client. Used to record
 * "started", "cancelled", "timeout", and native-plugin failures the server
 * would otherwise never see (because verifyRazorpayPayment was never
 * reached). Failing to log must never break checkout — callers wrap in
 * try/catch.
 */
export const logPaymentAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => logAttemptInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ownership check — user can only log against their own bookings.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id,user_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking || booking.user_id !== context.userId) throw new Error("Booking not found");

    let attemptNo = data.attemptNo ?? 1;
    if (!data.attemptNo) {
      const { data: last } = await supabaseAdmin
        .from("payment_attempts")
        .select("attempt_no")
        .eq("booking_id", data.bookingId)
        .order("attempt_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastNo = Number((last as any)?.attempt_no ?? 0);
      attemptNo = data.outcome === "started" || data.outcome === "retry" ? lastNo + 1 : Math.max(lastNo, 1);
    }

    const { error } = await supabaseAdmin.from("payment_attempts").insert({
      booking_id: data.bookingId,
      user_id: context.userId,
      provider: "razorpay",
      provider_order_id: data.providerOrderId ?? null,
      provider_payment_id: data.providerPaymentId ?? null,
      channel: data.channel,
      outcome: data.outcome,
      attempt_no: attemptNo,
      error_code: data.errorCode ?? null,
      error_message: data.errorMessage ?? null,
      metadata: data.metadata ?? {},
    } as any);
    if (error) throw new Error(error.message);

    // Phase 2 shadow: mirror the attempt into pipeline_events for the new
    // orchestrator. Legacy remains authoritative — this only augments logs.
    try {
      const stageMap: Record<string, string> = {
        started:   "payment_started",
        cancelled: "payment_cancelled",
        timeout:   "payment_timeout",
        failure:   "payment_failed",
        retry:     "payment_retry",
        success:   "payment_verified",
      };
      const stage = stageMap[data.outcome] ?? `payment_${data.outcome}`;
      await supabaseAdmin.rpc("ds_log_event" as any, {
        p_booking_id: data.bookingId,
        p_stage: stage,
        p_source: "new",
        p_actor: "logPaymentAttempt",
        p_status: data.outcome === "success" ? "ok" : (data.outcome === "started" || data.outcome === "retry" ? "ok" : "error"),
        p_payload: { channel: data.channel, attempt_no: attemptNo, error_code: data.errorCode ?? null } as any,
        p_error: data.errorMessage ?? null,
      });
    } catch (e) {
      console.warn("[ds-shadow] logPaymentAttempt shadow log failed (non-fatal)", e);
    }

    return { attemptNo };
  });

/**
 * Payment status polled by the client after the Razorpay window closes.
 * Reports whether the booking is paid (webhook / verifyRazorpayPayment may
 * have reconciled it out-of-band) plus the latest attempt outcome.
 */
export const getBookingPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => statusInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id,user_id,payment_status,service_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking || booking.user_id !== context.userId) throw new Error("Booking not found");

    const { data: latest } = await supabaseAdmin
      .from("payment_attempts")
      .select("outcome,error_message,error_code,channel,created_at,attempt_no")
      .eq("booking_id", data.bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id,status")
      .eq("booking_id", data.bookingId)
      .maybeSingle();

    return {
      paymentStatus: (booking as any).payment_status as string | null,
      subscriptionId: (sub as any)?.id ?? null,
      subscriptionStatus: (sub as any)?.status ?? null,
      latestAttempt: latest ?? null,
    };
  });

/**
 * Admin-only: latest N payment attempts for a specific customer, for
 * troubleshooting failed subscription payments from the customer detail page.
 */
export const getUserPaymentAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => userAttemptsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let resolvedUserId = data.userId ?? null;
    if (!resolvedUserId && data.phone) {
      const normalized = data.phone.replace(/^\+?91/, "").replace(/\D/g, "");
      const { data: profile } = await supabaseAdmin
        .from("customer_profiles")
        .select("user_id,phone")
        .ilike("phone", `%${normalized}%`)
        .limit(1)
        .maybeSingle();
      resolvedUserId = (profile as any)?.user_id ?? null;
    }
    if (!resolvedUserId) return { attempts: [] as any[] };

    const { data: rows, error } = await supabaseAdmin
      .from("payment_attempts")
      .select("id,booking_id,channel,outcome,attempt_no,error_code,error_message,provider_payment_id,created_at")
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    return { attempts: (rows ?? []) as Array<{
      id: string;
      booking_id: string;
      channel: string;
      outcome: string;
      attempt_no: number;
      error_code: string | null;
      error_message: string | null;
      provider_payment_id: string | null;
      created_at: string;
    }> };
  });


