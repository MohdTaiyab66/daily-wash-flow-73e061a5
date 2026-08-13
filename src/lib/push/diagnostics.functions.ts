import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPushDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const userId = (context as any).userId;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const sb = supabaseAdmin as any;

      const { data: profile } = await sb
        .from("customer_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: tokens } = await sb
        .from("push_tokens")
        .select("*")
        .eq("user_id", userId)
        .is("invalid_at", null);

      const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
      const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;

      console.log(`[CUSTOMER-FCM-CONFIG] Backend Diagnostics Check - Project: ${firebaseProjectId}, Tokens: ${tokens?.length || 0}`);

      return {
        user_id: userId,
        is_customer: !!profile,
        firebase_config: {
          project_id: firebaseProjectId || "MISSING",
          client_email: firebaseClientEmail ? `${firebaseClientEmail.split('@')[0]}@...` : "MISSING",
          has_private_key: !!process.env.FIREBASE_PRIVATE_KEY,
        },

        tokens: tokens?.map((t: any) => ({
          id: t.id,
          platform: t.platform,
          app: t.app,
          last_seen: t.last_seen,
          token_tail: t.token ? `...${t.token.slice(-8)}` : "EMPTY",
        })) || [],
      };
    } catch (e: any) {
      console.error("[getPushDiagnostics] FAILED", e);
      throw e;
    }
  });

export const sendDirectTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ targetUserId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { sendOfferPush } = await import("./send.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const sb = supabaseAdmin as any;

      console.log(`[DIRECT-FCM-E2E:01] BUTTON_CLICKED targetUserId=${data.targetUserId}`);
      
      // STEP 8: PREVENT STALE TOKEN PROBLEMS - Query live push_tokens table
      const { data: tokens, error } = await sb
        .from("push_tokens")
        .select("*")
        .eq("user_id", data.targetUserId)
        .eq("platform", "android")
        .is("invalid_at", null)
        .order("last_seen", { ascending: false });

      if (error) {
        console.error(`[DIRECT-FCM-E2E:ERR] Failed to fetch tokens: ${error.message}`);
        throw error;
      }

      const tokenCount = tokens?.length || 0;
      const activeToken = tokens?.[0];
      
      console.log(`[DIRECT-FCM-E2E:02] CUSTOMER_USER_ID=${data.targetUserId} TOKEN_COUNT=${tokenCount}`);
      
      if (!activeToken) {
        console.error(`[DIRECT-FCM-E2E:ERR] NO_ACTIVE_ANDROID_TOKENS`);
        return { sent: 0, failed: 0, results: [], error: "No active Android tokens found" };
      }

      console.log(`[DIRECT-FCM-E2E:TOKEN] USER_ID=${data.targetUserId} TOKEN_LAST_6=${activeToken.token.slice(-6)} PLATFORM=${activeToken.platform} UPDATED_AT=${activeToken.last_seen}`);

      // STEP 3: VERIFY FIREBASE PROJECT
      console.log(`[DIRECT-FCM-E2E:FIREBASE] project_id=${process.env.FIREBASE_PROJECT_ID} client_email=${process.env.FIREBASE_CLIENT_EMAIL}`);

      console.log(`[DIRECT-FCM-E2E:03] SEND_STARTED`);
      
      const res = await sendOfferPush({
        userId: data.targetUserId,
        title: "🚨 Test Notification",
        body: "This is a direct FCM test from the diagnostics panel.",
        data: {
          type: "direct_test",
          title: "Urban Wash Test", // Redundant but safe
          body: "Direct FCM test notification",
          broadcast_id: `test:${Date.now()}`,
          action_token: `test_token:${Date.now()}`,
          sent_at: new Date().toISOString(),
        },
        channelId: "assignments_v4",
        // P0: Use dataOnly: true for a deterministic test of the native Kotlin service.
        // This ensures system auto-display doesn't intercept the message, forcing 
        // the Kotlin UrbanwashMessagingService to process it and log markers.
        dataOnly: true,
      });

      const successCount = res.results.filter((r: any) => r.ok).length;
      const failureCount = res.results.filter((r: any) => !r.ok).length;
      const firstResult = res.results[0];

      console.log(`[DIRECT-FCM-E2E:04] FCM_RESPONSE message_id=${firstResult?.messageId || "N/A"} success_count=${successCount} failure_count=${failureCount} error_code=${firstResult?.errorCode || "NONE"} error_message=${firstResult?.errorMessage || "NONE"}`);
      
      return {
        ...res,
        projectId: process.env.FIREBASE_PROJECT_ID,
        tokenTail: activeToken.token.slice(-6),
        sentAt: new Date().toISOString(),
      };
    } catch (e: any) {
      console.error("[sendDirectTestPush] FAILED", e);
      throw e;
    }
  });
