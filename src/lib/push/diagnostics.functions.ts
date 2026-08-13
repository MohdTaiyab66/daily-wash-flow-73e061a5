import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPushDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as any).userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const { data: profile } = await sb
      .from("customer_profiles")
      .select("id")
      .eq("user_id", userId)
      .single();

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
  });

export const sendDirectTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ targetUserId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendOfferPush } = await import("./send.server");
    
    console.log(`[CUSTOMER-SERVICE-PUSH:DIRECT-TEST] Starting direct test for user: ${data.targetUserId}`);
    
    const res = await sendOfferPush({
      userId: data.targetUserId,
      title: "🚨 Test Notification",
      body: "This is a direct FCM test from the diagnostics panel.",
      data: {
        type: "service_completed", // Use a known high-importance type
        test_mode: "true",
        sent_at: new Date().toISOString(),
        broadcast_id: `test:${Date.now()}`,
        action_token: "test_token",
        offer_id: "test_offer",
      },
      channelId: "assignments_v4",
    });

    console.log(`[CUSTOMER-SERVICE-PUSH:DIRECT-TEST] Result:`, res);
    return res;
  });
