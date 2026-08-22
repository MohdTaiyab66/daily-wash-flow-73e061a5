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
      // UNIVERSAL P0 FIX: Identity fragmentation resolution for Assignment Reminders.
      let targetUserId = a.partner_id;
      const { data: partner } = await sb.from("partners").select("phone").eq("id", a.partner_id).maybeSingle();
      if (partner?.phone) {
        const { data: tokens } = await sb.from("push_tokens").select("id").eq("user_id", a.partner_id).is("invalid_at", null).limit(1);
        if (!tokens || tokens.length === 0) {
          const { data: others } = await sb.from("partners").select("id").eq("phone", partner.phone).neq("id", a.partner_id);
          const otherPartnerIds = (others || []).map((p: any) => p.id);
          const { data: customers } = await sb.from("customer_profiles").select("id").eq("phone", partner.phone);
          const customerIds = (customers || []).map((c: any) => c.id);
          const allIdentityIds = [...new Set([...otherPartnerIds, ...customerIds])];
          
          if (allIdentityIds.length > 0) {
            const { data: altTokens } = await sb.from("push_tokens").select("user_id").in("user_id", allIdentityIds).is("invalid_at", null).limit(1);
            if (altTokens && altTokens.length > 0) {
              targetUserId = altTokens[0].user_id;
            }
          }
        }
      }

      const result = await sendOfferPush({
        userId: targetUserId,
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
