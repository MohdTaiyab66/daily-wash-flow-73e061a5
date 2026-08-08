/**
 * Partner-side FCM Self-Test.
 *
 * Sends a real FCM push to the caller's own registered push_tokens, using the
 * exact same code path as the offer dispatcher (data-only, HIGH priority,
 * `assignments_v4` channel).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RESPONSE SCHEMA — v2  (FROZEN — client parser depends on this exact shape)
 * ─────────────────────────────────────────────────────────────────────────
 * Every code path MUST return every field. No optional keys, no drift.
 *
 *   schemaVersion : 2
 *   serverBuild   : string          // build id the backend was serving
 *   runtime       : string          // "cloudflare" | "unknown" | ...
 *   env           : { projectId, clientEmail, privateKey } booleans
 *   keyShape      : any | null      // structural PEM diagnostics (no secrets)
 *   scenario      : "offer" | "assignment" | "generic"
 *   channelId     : string          // "—" if not reached
 *   payloadType   : string          // "—" if not reached
 *   dataOnly      : boolean         // false if not reached
 *   ok            : boolean
 *   sent          : number
 *   failed        : number
 *   tokenCount    : number
 *   error         : string | null
 *   stack         : string | null
 *   results       : Array<{ ok, httpStatus, messageId, errorCode, errorMessage, tokenTail }>
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCHEMA_VERSION = 2 as const;

type ResultRow = {
  ok: boolean;
  httpStatus: string;
  messageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  tokenTail: string | null;
};

type SelfTestResponse = {
  schemaVersion: typeof SCHEMA_VERSION;
  serverBuild: string;
  runtime: string;
  env: { projectId: boolean; clientEmail: boolean; privateKey: boolean };
  keyShape: any | null;
  scenario: "offer" | "assignment" | "generic";
  channelId: string;
  payloadType: string;
  dataOnly: boolean;
  ok: boolean;
  sent: number;
  failed: number;
  tokenCount: number;
  error: string | null;
  stack: string | null;
  results: ResultRow[];
};

function baseResponse(scenario: "offer" | "assignment" | "generic"): SelfTestResponse {
  return {
    schemaVersion: SCHEMA_VERSION,
    serverBuild: process.env.PARTNER_BUILD_ID ?? process.env.BUILD_ID ?? "unknown",
    runtime:
      (process.env.NODE_ENV as string | undefined) ??
      (process.env.CF_PAGES ? "cloudflare" : "unknown"),
    env: {
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    },
    keyShape: null,
    scenario,
    channelId: "—",
    payloadType: "—",
    dataOnly: false,
    ok: false,
    sent: 0,
    failed: 0,
    tokenCount: 0,
    error: null,
    stack: null,
    results: [],
  };
}

export const sendPushSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { scenario?: "offer" | "assignment" | "generic" }) => ({
    scenario: input?.scenario ?? "offer",
  }))
  .handler(async ({ data, context }): Promise<SelfTestResponse> => {
    const res = baseResponse(data.scenario);

    try {
      try {
        const { inspectPrivateKey } = await import("@/lib/push/send.server");
        res.keyShape = inspectPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      } catch (inspectErr) {
        res.keyShape = { inspectError: (inspectErr as Error)?.message ?? String(inspectErr) };
      }
      // eslint-disable-next-line no-console
      console.log("[push-selftest] env presence", {
        runtime: res.runtime,
        serverBuild: res.serverBuild,
        ...res.env,
        keyShape: res.keyShape,
      });

      if (!res.env.projectId || !res.env.clientEmail || !res.env.privateKey) {
        res.error = "FCM is not configured in this runtime";
        return res;
      }

      const userId = (context as any).userId;

      if (data.scenario === "assignment") {
        res.channelId = "assignments_v4";
        res.payloadType = "new_assignment";
        res.dataOnly = true;
      } else if (data.scenario === "generic") {
        res.channelId = "general";
        res.payloadType = "generic_test";
        res.dataOnly = false;
      } else {
        res.channelId = "assignments_v4";
        res.payloadType = "daily_shine_offer";
        res.dataOnly = true;
      }

      const title =
        data.scenario === "assignment"
          ? "🚗 Test assignment"
          : data.scenario === "generic"
            ? "Urban Wash test"
            : "🚗 New Daily Shine Customer";
      const body =
        data.scenario === "assignment"
          ? "TEST PUSH — assignment heads-up (self-test)"
          : data.scenario === "generic"
            ? "TEST PUSH — generic tray (self-test)"
            : "TEST PUSH — 90s to accept (self-test)";

      const tag = `selftest-${Date.now()}`;
      const payload: Record<string, string> = {
        type: res.payloadType,
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

      try {
        const { sendOfferPush } = await import("@/lib/push/send.server");
        const result = await sendOfferPush({
          userId,
          title,
          body,
          data: payload,
          channelId: res.channelId as "assignments_v4" | "offers_v4" | "general",
          dataOnly: res.dataOnly,
          tag,
        });

        res.sent = result.sent;
        res.failed = result.failed;
        res.tokenCount = result.results.length;
        res.ok = result.sent > 0;
        res.results = result.results.map((r) => ({
          ok: r.ok,
          httpStatus: r.ok ? "200 OK" : (r.errorCode ?? "ERROR"),
          messageId: r.messageId ?? null,
          errorCode: r.errorCode ?? null,
          errorMessage: r.errorMessage ?? null,
          tokenTail: r.token ? r.token.slice(-12) : null,
        }));
        return res;
      } catch (sendErr) {
        res.error = (sendErr as Error)?.message ?? String(sendErr);
        res.stack = (sendErr as Error)?.stack ?? null;
        // eslint-disable-next-line no-console
        console.error("[push-selftest] sendOfferPush threw", { message: res.error, stack: res.stack });
        return res;
      }
    } catch (fatal) {
      res.error = (fatal as Error)?.message ?? String(fatal);
      res.stack = (fatal as Error)?.stack ?? null;
      // eslint-disable-next-line no-console
      console.error("[push-selftest] fatal", { message: res.error, stack: res.stack });
      return res;
    }
  });
