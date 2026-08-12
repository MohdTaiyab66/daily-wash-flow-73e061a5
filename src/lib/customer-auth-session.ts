import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared logic for customer session management to ensure consistent behavior 
 * across Splash, Gate, and Auth screens.
 */
export const sessionManager = {
  async getSession() {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch (e) {
      console.error("[AUTH] getSession failed", e);
      return null;
    }
  },

  isCustomer(session: any) {
    return !!session?.user?.email?.endsWith("@customer.urbanwash.app");
  },

  redirect(to: string = "/c/auth") {
    return redirect({ to, replace: true });
  }
};
