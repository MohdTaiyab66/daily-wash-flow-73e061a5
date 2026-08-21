import { supabase } from "@/integrations/supabase/client";

export async function createAdminNotificationForBooking(bookingId: string, title: string, body: string) {
  const { error } = await supabase.from("admin_notifications").insert({
    category: "bookings",
    title,
    body,
    metadata: { booking_id: bookingId },
    link: `/admin/assign-booking/${bookingId}`
  });
  
  if (error) console.error("[admin-notif] create failed", error);
}
