import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Legacy auth route — onboarding now lives at /c/welcome.
export const Route = createFileRoute("/c/auth")({
  ssr: false,
  component: AuthRedirect,
});

function AuthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/c/welcome", replace: true });
  }, [navigate]);
  return null;
}
