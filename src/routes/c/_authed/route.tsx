import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sessionManager } from "@/lib/customer-auth-session";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { useAuth } from "@/components/customer/AuthProvider";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  component: CustomerAuthedLayout,
});

function CustomerAuthedLayout() {
  const { authStatus, session } = useAuth();
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Only proceed once we have a definitive auth state
    if (authStatus === 'initializing') return;

    if (authStatus === 'unauthenticated') {
      console.warn("[GATE] Unauthenticated, redirecting to auth");
      navigate({ to: "/c/auth", replace: true });
    } else if (authStatus === 'authenticated') {
      console.log("[GATE] Authenticated, ready");
      setIsReady(true);
    }
  }, [authStatus, navigate]);

  useFcmRegistration(session?.user?.id, "customer");

  if (authStatus === 'initializing' || !isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF9F3]">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
          <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest">Verifying Access...</p>
        </div>
      </div>
    );
  }

  return (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  );
}

