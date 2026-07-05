/**
 * Server-only FCM HTTP v1 sender.
 *
 * Reads three env vars (set via Lovable secrets):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (PEM, with literal "\n" escape sequences allowed)
 *
 * Caches the OAuth access token in-process for ~55 minutes. On the Cloudflare
 * Worker runtime this cache lives for the lifetime of the isolate, which is
 * the right granularity (not a global secret leak, not per-request churn).
 */
import { SignJWT, importPKCS8 } from "jose";

type AccessToken = { token: string; exp: number };
let cachedToken: AccessToken | null = null;

function normalizePem(pem: string): string {
  // Lovable secrets store newlines as literal "\n"; convert them back.
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FCM is not configured: missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  }

  const key = await importPKCS8(normalizePem(privateKey), "RS256");
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM oauth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return cachedToken.token;
}

export type FcmSendResult = {
  token: string;
  ok: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
};

type SendInput = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId?: string;
  android?: { priority?: "HIGH" | "NORMAL"; ttl?: string };
  /** When true, send a data-only message with no visible notification block —
   * the native service uses this to update the existing heads-up in place
   * (incentive bumped, radius expanded) without firing a fresh alert. */
  silent?: boolean;
  /** Optional Android collapse key. Marketplace passes the broadcast id so
   * successive updates replace the same notification. */
  tag?: string;
};

async function sendOne(input: SendInput): Promise<FcmSendResult> {
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const accessToken = await getAccessToken();

  const androidBlock: Record<string, unknown> = {
    priority: input.silent ? "NORMAL" : input.android?.priority ?? "HIGH",
    ttl: input.android?.ttl ?? "120s",
  };
  if (input.tag) androidBlock.collapse_key = input.tag;
  if (!input.silent) {
    androidBlock.notification = {
      title: input.title,
      body: input.body,
      channel_id: input.channelId ?? "general",
      sound: "default",
      default_vibrate_timings: true,
      notification_priority: "PRIORITY_MAX",
      tag: input.tag,
    };
  }

  const message: Record<string, unknown> = {
    message: {
      token: input.token,
      data: input.data,
      android: androidBlock,
      ...(input.silent
        ? {
            apns: {
              headers: { "apns-priority": "5", "apns-push-type": "background" },
              payload: { aps: { "content-available": 1 } },
            },
          }
        : {
            apns: {
              headers: { "apns-priority": "10" },
              payload: {
                aps: { alert: { title: input.title, body: input.body }, sound: "default", "content-available": 1 },
              },
            },
            notification: { title: input.title, body: input.body },
          }),
    },
  };

  let lastErr: { code?: string; message?: string } = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (res.ok) {
      const json = (await res.json()) as { name: string };
      return { token: input.token, ok: true, messageId: json.name };
    }
    const text = await res.text();
    let code: string | undefined;
    try {
      const j = JSON.parse(text);
      code = j?.error?.details?.[0]?.errorCode ?? j?.error?.status;
      lastErr = { code, message: j?.error?.message ?? text };
    } catch {
      lastErr = { message: text };
    }
    // Permanent failures — bail immediately so caller can mark token invalid.
    if (code && ["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH", "NOT_FOUND"].includes(code)) {
      return { token: input.token, ok: false, errorCode: code, errorMessage: lastErr.message };
    }
    // Backoff for transient errors (UNAVAILABLE, INTERNAL, QUOTA_EXCEEDED).
    await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
  }
  return { token: input.token, ok: false, errorCode: lastErr.code, errorMessage: lastErr.message };
}

/**
 * Send the same offer payload to every active token for a user, then mark
 * any tokens FCM rejected as invalid so the picker stops choosing this user.
 */
export async function sendOfferPush(args: {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId?: string;
}): Promise<{ sent: number; failed: number; results: FcmSendResult[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tokens, error } = await (supabaseAdmin as any)
    .from("push_tokens")
    .select("id, token")
    .eq("user_id", args.userId)
    .is("invalid_at", null);
  if (error) throw error;
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0, results: [] };

  const results = await Promise.all(
    tokens.map((t: { token: string }) =>
      sendOne({ token: t.token, title: args.title, body: args.body, data: args.data, channelId: args.channelId }),
    ),
  );

  // Cleanup invalid tokens
  const invalidIds = tokens
    .filter((t: { id: string; token: string }, i: number) => {
      const r = results[i];
      return !r.ok && (r.errorCode === "UNREGISTERED" || r.errorCode === "INVALID_ARGUMENT" || r.errorCode === "NOT_FOUND" || r.errorCode === "SENDER_ID_MISMATCH");
    })
    .map((t: { id: string }) => t.id);
  if (invalidIds.length) {
    await (supabaseAdmin as any)
      .from("push_tokens")
      .update({ invalid_at: new Date().toISOString() })
      .in("id", invalidIds);
  }

  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
