/**
 * Server-only helper that raises the "booking paid" admin alert exactly once
 * per booking, no matter which path activated it (client verification or the
 * Razorpay webhook).
 */
export async function notifyAdminBookingPaid(bookingId: string, amount?: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotency: skip when an alert for this booking already exists.
    const { data: existing } = await supabaseAdmin
      .from("admin_notifications")
      .select("id")
      .eq("category", "bookings")
      .contains("metadata", { booking_id: bookingId })
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true, deduped: true };

    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("user_id,total_amount,service_catalog:service_id(name)")
      .eq("id", bookingId)
      .maybeSingle();

    const userId = (booking as any)?.user_id as string | undefined;
    let customer: any = null;
    if (userId) {
      const { data } = await supabaseAdmin
        .from("customers")
        .select("full_name, area")
        .eq("id", userId)
        .maybeSingle();
      customer = data;
    }

    const serviceName = (booking as any)?.service_catalog?.name || "Booking";
    const value = amount ?? Number((booking as any)?.total_amount ?? 0);

    const { error } = await supabaseAdmin.from("admin_notifications").insert({
      category: "bookings",
      title: `${String(serviceName).toUpperCase()} PAID`,
      body: `New paid booking for ${customer?.full_name || "Customer"} in ${customer?.area || "unknown area"}.`,
      metadata: {
        booking_id: bookingId,
        customer_name: customer?.full_name,
        area: customer?.area,
        amount: value,
      },
      link: `/admin/assign-booking/${bookingId}`,
    });
    if (error) {
      console.error("[ADMIN-BOOKING-E2E] insert failed", error.message);
      return { ok: false, error: error.message };
    }

    const { dispatchAdminNotifications } = await import("@/lib/push/dispatch.server");
    await dispatchAdminNotifications();
    return { ok: true };
  } catch (e: any) {
    console.error("[ADMIN-BOOKING-E2E] alert failed", e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}
