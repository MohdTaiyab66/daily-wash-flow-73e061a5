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
    // Runtime env visibility (booleans only — never log values).
    const env = {
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    };
    const runtime =
      (process.env.NODE_ENV as string | undefined) ??
      (process.env.CF_PAGES ? "cloudflare" : "unknown");

    const { inspectPrivateKey } = await import("@/lib/push/send.server");
    const keyShape = inspectPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    // eslint-disable-next-line no-console
    console.log("[push-selftest] env presence", { runtime, ...env, keyShape });

    if (!env.projectId || !env.clientEmail || !env.privateKey) {
      return {
        ok: false,
        sent: 0,
        failed: 0,
        tokenCount: 0,
        runtime,
        env,
        keyShape,
        error: "FCM is not configured in this runtime",
        results: [],
        scenario: data.scenario,
      };
    }

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
      runtime,
      env,
      channelId,
      dataOnly,
      payloadType: type,
      results: result.results.map((r) => ({
        ok: r.ok,
        httpStatus: r.ok ? "200 OK" : (r.errorCode ?? "ERROR"),
        messageId: r.messageId ?? null,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
        tokenTail: r.token ? r.token.slice(-12) : null,
      })),
      scenario: data.scenario,
    };

  });
