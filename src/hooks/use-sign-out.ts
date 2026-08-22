import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { stopFcm } from "@/lib/push/fcm";
import { useNavigate } from "@tanstack/react-router";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = async (redirectTo?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      // 1. Stop FCM (invalidates token in DB for this device/user)
      if (userId) {
        await stopFcm(userId);
      }

      // 2. Tear down realtime channels while the auth token is still valid.
      try {
        await supabase.removeAllChannels();
      } catch {
        /* proceed with sign-out */
      }

      // 3. Sign out from Supabase
      await supabase.auth.signOut();

      // 4. Clear all cached queries to prevent data contamination
      queryClient.clear();

      // 4. Force reload to ensure all stores and listeners are reset
      let finalRedirect = redirectTo;
      if (!finalRedirect) {
        // Determine redirect destination based on identity
        const email = session?.user?.email || "";
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

      window.location.href = finalRedirect;
    } catch (error) {
      console.error("Logout error:", error);
      window.location.href = "/auth";
    }
  };

  return { signOut };
}
