import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getNativePushState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // This is a bridge function that would normally call a Capacitor plugin.
    // For now, it's a stub that the Capacitor layer will intercept or we use to track what we expect.
    return {
      last_fcm: null,
      last_notif: null,
      android_config: {
        application_id: "com.urbanwash.customer",
        firebase_project_id: "uw-partner-app",
      }
    };
  });
