import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { stopFcm } from "@/lib/push/fcm";
import { useNavigate } from "@tanstack/react-router";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = async (redirectTo?: string) => {
    try {
      // 1. Capture role BEFORE session clear
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      const email = session?.user?.email || "";

      console.log("[LOGOUT-TRACE] Role detected BEFORE logout:", email);

      // 2. Stop FCM (invalidates token in DB for this device/user)
      if (userId) {
        await stopFcm(userId);
      }

      // 3. Tear down realtime channels while the auth token is still valid.
      try {
        await supabase.removeAllChannels();
      } catch {
        /* proceed with sign-out */
      }

      // 4. Sign out from Supabase
      await supabase.auth.signOut();
      
      console.log("[LOGOUT-TRACE] Supabase session cleared");

      // 5. Clear all cached queries to prevent data contamination
      queryClient.clear();

      // 6. Force reload to ensure all stores and listeners are reset
      let finalRedirect = redirectTo;
      if (!finalRedirect) {
        // Determine redirect destination based on identity captured BEFORE logout
        if (email.endsWith("@admin.urbanwash.app")) {
          finalRedirect = "/auth?redirect=/admin";
        } else if (email.endsWith("@partner.urbanwash.app")) {
          finalRedirect = "/auth?redirect=/app";
        } else if (email.endsWith("@customer.urbanwash.app")) {
          finalRedirect = "/c/auth";
        } else {
          finalRedirect = "/";
        }
      }

      console.log("[LOGOUT-TRACE] Destination selected:", finalRedirect);
      window.location.replace(finalRedirect);
    } catch (error) {
      console.error("Logout error:", error);
      window.location.replace("/auth");
    }
  };

  return { signOut };
}
