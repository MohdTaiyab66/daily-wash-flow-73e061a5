import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Idempotent FCM token registration.
 *
 * `push_tokens` has a UNIQUE constraint on `token` as well as on
 * (user_id, device_id, app). A plain client-side upsert with
 * `onConflict: user_id,device_id,app` therefore blows up with 23505 whenever
 * the same token row already exists under a different user/device (re-install,
 * account switch, restored backup). RLS also blocks the client from touching a
 * row owned by another user, so ownership transfer has to run server-side.
 *
 * Strategy (no schema change):
 *  1. claim the token row by `token` (moves it to the current user/device), or
 *     insert it when it does not exist yet;
 *  2. clear any stale rows for this user+device+app that hold an older token.
 */
export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        token: z.string().min(10),
        platform: z.string().min(1),
        device_id: z.string().min(1),
        app: z.enum(["partner", "customer"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const userId = (context as any).userId;
    const now = new Date().toISOString();

    const row = {
      user_id: userId,
      token: data.token,
      platform: data.platform,
      device_id: data.device_id,
      app: data.app,
      last_seen: now,
      invalid_at: null,
    };

    // 1) Token is globally unique — conflict on it so an existing row is moved
    //    to the current user/device instead of throwing 23505.
    const { error: tokenErr } = await sb.from("push_tokens").upsert(row, { onConflict: "token" });
    if (tokenErr) {
      console.warn(`[CUSTOMER-FCM-REGISTRATION:SERVER] Conflict on token, attempting update by device_id: ${tokenErr.message}`);
      // Fallback: the (user_id, device_id, app) row exists with a different
      // token — update it in place.
      const { error: devErr } = await sb
        .from("push_tokens")
        .update({ token: data.token, platform: data.platform, last_seen: now, invalid_at: null })
        .match({ user_id: userId, device_id: data.device_id, app: data.app });
      if (devErr) throw devErr;
    }

    // 2) Drop stale rows for this device/app that still carry an old token.
    await sb
      .from("push_tokens")
      .delete()
      .match({ user_id: userId, device_id: data.device_id, app: data.app })
      .neq("token", data.token);

    const { data: currentTokens } = await sb.from("push_tokens").select("id").eq("user_id", userId).is("invalid_at", null);
    console.log(`[CUSTOMER-FCM-REGISTRATION:06] active token count after upsert = ${currentTokens?.length || 0}`);

    return { ok: true as const, user_id: userId };

  });
