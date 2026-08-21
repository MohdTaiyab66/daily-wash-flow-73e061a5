import { supabase } from "@/integrations/supabase/client";

/**
 * Creates an admin notification and triggers the immediate push dispatch.
 */
export async function createAdminNotificationForBooking(bookingId: string, title: string, body: string) {
  const { error } = await supabase.from("admin_notifications").insert({
    category: "bookings",
    title,
    body,
    metadata: { booking_id: bookingId },
    link: `/admin/assign-booking/${bookingId}`
  });
  
  if (error) {
    console.error("[admin-notif] create failed", error);
    return;
  }

  // Trigger immediate push dispatch via server function
  try {
    const { dispatchAdminAlerts } = await import("@/lib/push/dispatch.server");
    await dispatchAdminAlerts();
  } catch (e) {
    console.warn("[admin-notif] immediate dispatch failed", e);
  }
}
