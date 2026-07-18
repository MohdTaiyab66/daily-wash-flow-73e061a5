/**
 * Partner-side FCM Self-Test.
 *
 * Sends a real FCM push to the caller's own registered push_tokens, using the
 * exact same code path as the offer dispatcher (data-only, HIGH priority,
 * `assignments_v3` channel). Purpose: verify Android delivery in every device
 * state (foreground / background / killed / locked / Doze) without needing a
 * paid booking to flow through the pipeline.
 *
 * Returns per-token results so the UI can show which tokens succeeded and
 * which errored (UNREGISTERED, INVALID_ARGUMENT, etc.).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendPushSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scenario?: "offer" | "assignment" | "generic" }) => ({
    scenario: input?.scenario ?? "offer",
  }))
  .handler(async ({ data, context }) => {
    const { sendOfferPush } = await import("@/lib/push/send.server");
    const userId = context.userId;

    let title = "🚗 New Daily Shine Customer";
    let body = "TEST PUSH — 90s to accept (self-test)";
    let type = "daily_shine_offer";
    let dataOnly = true;
    let channelId: "assignments_v3" | "offers_v3" | "general" = "assignments_v3";

    if (data.scenario === "assignment") {
      title = "🚗 Test assignment";
      body = "TEST PUSH — assignment heads-up (self-test)";
      type = "new_assignment";
      dataOnly = true;
      channelId = "assignments_v3";
    } else if (data.scenario === "generic") {
      title = "Urban Wash test";
      body = "TEST PUSH — generic tray (self-test)";
      type = "generic_test";
      dataOnly = false;
      channelId = "general";
    }

    const tag = `selftest-${Date.now()}`;
    const payload: Record<string, string> = {
      type,
      link: "/app",
      selftest: "1",
      offer_id: tag,
      queue_id: tag,
      partner_id: userId,
      broadcast_id: tag,
      action_token: tag,
      area: "Self-test",
      vehicle_category: "Test vehicle",
      title,
      body,
    };

    const result = await sendOfferPush({
      userId,
      title,
      body,
      data: payload,
      channelId,
      dataOnly,
      tag,
    });

    return {
      ok: result.sent > 0,
      sent: result.sent,
      failed: result.failed,
      tokenCount: result.results.length,
      results: result.results.map((r) => ({
        ok: r.ok,
        messageId: r.messageId,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        tokenTail: r.token ? r.token.slice(-8) : null,
      })),
      scenario: data.scenario,
    };
  });
