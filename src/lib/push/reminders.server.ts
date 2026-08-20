/**
 * Server-side reminder logic for unaccepted partner assignments.
 */
import { getTodayIST } from "@/lib/date-utils";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/**
 * Sweeps all pending assignments and sends reminders if they remain unaccepted.
 * Interval: Initial push (on creation) -> Reminder 1 (15m) -> Reminder 2 (30m).
 */
export async function dispatchAssignmentReminders(): Promise<number> {
  const sb = await admin();
  const today = getTodayIST();
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Find active assignments that are still 'pending' and haven't been accepted
  // and are due for a reminder. We look for those created > 15m ago where 
  // no 'reminder_sent_at' exists or was sent > 15m ago.
  const { data: assignments, error } = await sb
    .from("assignments")
    .select("id, partner_id, created_at, metadata")
    .eq("status", "active")
    .gte("end_date", today)
    .lt("created_at", fifteenMinsAgo)
    .is("accepted_at", null)
    .neq("status", "cancelled");

  if (error) throw error;
  if (!assignments || assignments.length === 0) return 0;

  const { sendOfferPush } = await import("./send.server");
  let sentCount = 0;

  for (const a of assignments) {
    const lastReminder = a.metadata?.last_reminder_sent_at;
    const createdAt = new Date(a.created_at).getTime();
    const now = Date.now();
    
    // Only remind if it's been at least 15m since creation AND 15m since last reminder
    if (lastReminder && (now - new Date(lastReminder).getTime() < 15 * 60 * 1000)) {
      continue;
    }

    console.log(`[PARTNER-E2E:11-REMINDER] Sending reminder for assignment=${a.id} partner=${a.partner_id}`);

    try {
      const result = await sendOfferPush({
        userId: a.partner_id,
        title: "Assignment Reminder",
        body: "You have a pending service assignment. Please accept it now to start your route.",
        data: {
          type: "new_assignment",
          assignment_id: a.id,
          is_reminder: "true",
          link: "/app/live",
          broadcast_id: `reminder:${a.id}`,
          action_token: `reminder:${a.id}`
        },
        channelId: "assignments_v4",
        dataOnly: true,
        tag: `reminder:${a.id}`
      });

      if (result.sent > 0) {
        sentCount++;
        // Update metadata with last reminder timestamp
        const newMetadata = { 
          ...(a.metadata || {}), 
          last_reminder_sent_at: new Date().toISOString(),
          reminder_count: (a.metadata?.reminder_count || 0) + 1
        };
        await sb.from("assignments").update({ metadata: newMetadata }).eq("id", a.id);
      }
    } catch (e) {
      console.error(`[ASSIGNMENT-REMINDER:ERROR] Failed for assignment=${a.id}`, e);
    }
  }

  return sentCount;
}
