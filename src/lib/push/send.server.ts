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

export function normalizePem(raw: string): string {
  let pem = raw.trim().replace(/^\uFEFF/, "");

  // If the full service-account JSON was pasted by mistake, use only private_key.
  if (pem.startsWith("{")) {
    try {
      const parsed = JSON.parse(pem) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") pem = parsed.private_key;
    } catch {
      /* ignore */
    }
  }

  // If a JSON property line was pasted (`"private_key": "...",`), unwrap the string value.
  const propertyMatch = pem.match(/^\s*"private_key"\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/s);
  if (propertyMatch) {
    try {
      pem = JSON.parse(propertyMatch[1]) as string;
    } catch {
      pem = propertyMatch[1];
    }
  }

  pem = pem.trim();
  // Unwrap a complete JSON string if the secret manager returns one.
  if (pem.startsWith('"') && pem.endsWith('"')) {
    try {
      pem = JSON.parse(pem) as string;
    } catch {
      pem = pem.slice(1, -1);
    }
  } else if (pem.startsWith("'") && pem.endsWith("'")) {
    pem = pem.slice(1, -1);
  }

  // Some runtimes/copy paths leave only a trailing JSON quote/comma. Strip only
  // boundary punctuation; do not mutate the base64 body itself.
  pem = pem.trim().replace(/^["']+/, "").replace(/["',]+$/, "").trim();

  // Convert escaped "\n" sequences to real newlines.
  if (pem.includes("\\n")) pem = pem.replace(/\\n/g, "\n");
  // Normalize CRLF -> LF.
  pem = pem.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Re-run boundary cleanup after newline normalization in case the quote was
  // after a literal \n sequence.
  pem = pem.trim().replace(/^["']+/, "").replace(/["',]+$/, "").trim();

  // If the value is base64-encoded PEM (no BEGIN marker), decode it.
  if (!pem.includes("-----BEGIN")) {
    try {
      const decoded =
        typeof Buffer !== "undefined"
          ? Buffer.from(pem, "base64").toString("utf8")
          : atob(pem.replace(/\s+/g, ""));
      if (decoded.includes("-----BEGIN")) pem = decoded;
    } catch {
      /* ignore */
    }
  }
  return pem.trim() + "\n";
}

export function extractPemBody(normalizedPem: string): string {
  return normalizedPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
}

export function inspectPrivateKey(raw: string | undefined) {
  if (!raw) return { present: false } as const;
  const normalized = normalizePem(raw);
  const body = extractPemBody(normalized);
  const validBase64 = /^[A-Za-z0-9+/=]+$/.test(body);
  const invalidIndexes = [...body]
    .map((ch, index) => ({ ch, index }))
    .filter(({ ch }) => !/[A-Za-z0-9+/=]/.test(ch));
  let firstInvalidIndex = -1;
  let firstInvalidCode = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (!/[A-Za-z0-9+/=]/.test(ch)) {
      firstInvalidIndex = i;
      firstInvalidCode = body.charCodeAt(i);
      break;
    }
  }
  const tail20Mask = body.slice(-20).replace(/[A-Za-z0-9+/=]/g, "•");
  return {
    present: true,
    rawLength: raw.length,
    rawBeginsWithPem: raw.startsWith("-----BEGIN"),
    rawContainsEscapedNewlines: raw.includes("\\n"),
    rawContainsCRLF: raw.includes("\r"),
    rawStartsWithQuote: raw.startsWith('"') || raw.startsWith("'"),
    normalizedBeginsWithPem: normalized.startsWith("-----BEGIN"),
    normalizedHasEndMarker: normalized.includes("-----END"),
    normalizedLineCount: normalized.split("\n").length,
    bodyLength: body.length,
    bodyValidBase64: validBase64,
    bodyQuoteCount: [...body].filter((ch) => ch === '"').length,
    bodyEndsWithQuote: body.endsWith('"'),
    bodyTail20Mask: tail20Mask,
    last10NonBase64CharCodes: [...body.slice(-10)].map((ch) =>
      /[A-Za-z0-9+/=]/.test(ch) ? null : ch.charCodeAt(0),
    ),
    invalidCharCount: invalidIndexes.length,
    lastInvalidIndex: invalidIndexes.at(-1)?.index ?? -1,
    lastInvalidCharHex: invalidIndexes.at(-1) ? "0x" + invalidIndexes.at(-1)!.ch.charCodeAt(0).toString(16) : null,
    firstInvalidIndex,
    firstInvalidCharCode: firstInvalidCode,
    firstInvalidCharHex: firstInvalidCode >= 0 ? "0x" + firstInvalidCode.toString(16) : null,
    firstInvalidContextMask:
      firstInvalidIndex >= 0
        ? body
            .slice(Math.max(0, firstInvalidIndex - 8), Math.min(body.length, firstInvalidIndex + 9))
            .split("")
            .map((ch, i) => {
              const absolute = Math.max(0, firstInvalidIndex - 8) + i;
              if (absolute === firstInvalidIndex) return `[${ch.charCodeAt(0).toString(16)}]`;
              return /[A-Za-z0-9+/=]/.test(ch) ? "•" : `<${ch.charCodeAt(0).toString(16)}>`;
            })
            .join("")
        : null,
  } as const;

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

  let key;
  try {
    key = await importPKCS8(normalizePem(privateKey), "RS256");
  } catch (e) {
    const shape = inspectPrivateKey(privateKey);
    throw new Error(
      `FCM private key parse failed: ${(e as Error).message}. shape=${JSON.stringify(shape)}`,
    );
  }
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
  /** Data-only, HIGH priority. Suppresses the FCM `notification` block so the
   * native `UrbanwashMessagingService.onMessageReceived` always runs, even
   * when the app is backgrounded or killed. Used for assignment/offer types
   * that must render through the unified Kotlin heads-up path (custom
   * channel, custom sound, full-screen intent, deep-link on tap). */
  dataOnly?: boolean;
  /** Optional Android collapse key. Marketplace passes the broadcast id so
   * successive updates replace the same notification. */
  tag?: string;
};

async function sendOne(input: SendInput): Promise<FcmSendResult> {
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  console.log(`[CUSTOMER-FCM-CONFIG] BACKEND_FIREBASE_PROJECT: ${projectId}`);
  const accessToken = await getAccessToken();

  const dataOnly = input.dataOnly === true;
  const androidBlock: Record<string, unknown> = {
    priority: dataOnly ? "HIGH" : input.silent ? "NORMAL" : input.android?.priority ?? "HIGH",
    ttl: input.android?.ttl ?? "120s",
  };
  if (input.tag) androidBlock.collapse_key = input.tag;
  if (!input.silent && !dataOnly) {
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

  // Native Kotlin service reads these fields from `data`.
  const dataPayload: Record<string, string> = { ...input.data };
  if (dataOnly) {
    if (input.title && dataPayload.title == null) dataPayload.title = input.title;
    if (input.body && dataPayload.body == null) dataPayload.body = input.body;
  }

  const message: Record<string, unknown> = {
    message: {
      token: input.token,
      data: dataPayload,
      android: androidBlock,
      ...(input.silent || dataOnly
        ? {
            apns: {
              headers: {
                "apns-priority": dataOnly ? "10" : "5",
                "apns-push-type": "background",
              },
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
    const bodyStr = JSON.stringify(message);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: bodyStr,
    });
    if (res.ok) {
      const json = (await res.json()) as { name: string };
      console.log(`[CUSTOMER-E2E:11-FCM] FCM_SEND_RESULT SUCCESS token=${input.token.slice(-8)} messageId=${json.name}`);
      return { token: input.token, ok: true, messageId: json.name };
    }
    const text = await res.text();
    console.error(`[CUSTOMER-E2E:11-FCM] FCM_SEND_RESULT FAILURE status=${res.status} body=${text} token=${input.token.slice(-8)}`);
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
  silent?: boolean;
  dataOnly?: boolean;
  tag?: string;
}): Promise<{ sent: number; failed: number; results: FcmSendResult[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tokens, error } = await (supabaseAdmin as any)
    .from("push_tokens")
    .select("id, token")
    .eq("user_id", args.userId)
    .is("invalid_at", null);
  if (error) throw error;
  if (!tokens || tokens.length === 0) {
    console.log(`[CUSTOMER-E2E:09-TOKEN] ACTIVE_TOKEN_COUNT_AT_DISPATCH = 0 (user_id=${args.userId})`);
    return { sent: 0, failed: 0, results: [] };
  }
  console.log(`[CUSTOMER-E2E:09-TOKEN] ACTIVE_TOKEN_COUNT_AT_DISPATCH = ${tokens.length} (user_id=${args.userId})`);
  console.log(`[CUSTOMER-E2E:10-FCM] FCM_SEND_STARTED type=${args.data.type} tokens=[${tokens.map((t: { token: string }) => t.token.slice(-8)).join(", ")}]`);
  const results = await Promise.all(
    tokens.map((t: { token: string }) =>
      sendOne({
        token: t.token,
        title: args.title,
        body: args.body,
        data: args.data,
        channelId: args.channelId,
        silent: args.silent,
        dataOnly: args.dataOnly,
        tag: args.tag,
      }),
    ),
  );

  const successCount = results.filter(r => r.ok).length;
  const failureCount = results.filter(r => !r.ok).length;
  console.log(`[CUSTOMER-E2E:11-FCM] FCM_SEND_RESULT success_count=${successCount} failure_count=${failureCount}`);


  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.error(
      "[fcm] send failures",
      failures.map((r) => ({ code: r.errorCode, msg: r.errorMessage, tail: r.token.slice(-8) })),
    );
  }

  // Cleanup invalid tokens.
  // NOTE: SENDER_ID_MISMATCH is a server/app configuration problem (the token
  // belongs to a different Firebase project than the service account), NOT a
  // dead token. Invalidating on it silently wipes every registration during a
  // misconfiguration, so we log it and leave the row alone.
  const invalidIds = tokens
    .filter((t: { id: string; token: string }, i: number) => {
      const r = results[i];
      return !r.ok && (r.errorCode === "UNREGISTERED" || r.errorCode === "NOT_FOUND");
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
