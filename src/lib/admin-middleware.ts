import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-function middleware that requires the caller to be authenticated
 * AND to have the `admin` role in `user_roles`. Use on every admin
 * server function so they cannot be invoked anonymously.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) throw new Error("Forbidden: role check failed");
    if (!data) throw new Error("Forbidden: admin role required");
    return next({ context });
  });
