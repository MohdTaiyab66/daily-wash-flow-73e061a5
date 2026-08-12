import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared logic for customer session management to ensure consistent behavior 
 * across Splash, Gate, and Auth screens.
 */
export const sessionManager = {
  async getSession() {
    try {
      console.log("[AUTH] Manager.getSession() using singleton");
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch (e) {
      console.error("[AUTH] Manager.getSession() failed", e);
      return null;
    }
  },

  isCustomer(session: any) {
    const isCust = !!session?.user?.email?.endsWith("@customer.urbanwash.app");
    console.log("[AUTH] Manager.isCustomer check:", isCust, "user:", session?.user?.id);
    return isCust;
  },

  redirect(to: string = "/c/auth") {
    console.log("[AUTH] Manager.redirect to:", to);
    return redirect({ to, replace: true });
  }
};
