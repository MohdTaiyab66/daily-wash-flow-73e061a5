import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { stopFcm } from "@/lib/push/fcm";
import { useNavigate } from "@tanstack/react-router";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = async (redirectTo: string = "/") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      // 1. Stop FCM (invalidates token in DB for this device/user)
      if (userId) {
        await stopFcm(userId);
      }

      // 2. Sign out from Supabase
      await supabase.auth.signOut();

      // 3. Clear all cached queries to prevent data contamination
      queryClient.clear();

      // 4. Force reload to ensure all stores and listeners are reset
      if (redirectTo.startsWith("http")) {
        window.location.href = redirectTo;
      } else {
        // Using window.location.href instead of navigate for a cleaner slate
        window.location.href = redirectTo;
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Fallback
      window.location.href = "/";
    }
  };

  return { signOut };
}
