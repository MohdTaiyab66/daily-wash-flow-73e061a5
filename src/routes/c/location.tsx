import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Navigation } from "lucide-react";
import { nearestServiceArea } from "@/lib/areas";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/c/location")({
  ssr: false,
  head: () => ({ meta: [{ title: "Your location — Urban Wash" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
  },
  component: LocationPermission,
});

function LocationPermission() {
  const navigate = useNavigate();
  const [locating, setLocating] = useState(false);

  const useGPS = () => {
    if (!("geolocation" in navigator)) { toast.error("Geolocation not available"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const a = nearestServiceArea(p.coords.latitude, p.coords.longitude);
        const dx = Math.hypot(a.lat - p.coords.latitude, a.lng - p.coords.longitude);
        if (dx > 0.15) {
          toast.error("We're not in your area yet — please search manually");
          navigate({ to: "/c/location/search" });
          return;
        }
        localStorage.setItem("uw_customer_area", a.name);
        localStorage.setItem("uw_customer_full_address", `Near ${a.name}, Lucknow`);
        toast.success(`Detected: ${a.name}`);
        navigate({ to: "/c/home" });
      },
      () => {
        setLocating(false);
        toast.error("Couldn't read your location. Try entering it manually.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-12 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">What's your location?</h1>
        <p className="mt-2 text-base text-muted-foreground">
          We need your location to show you our serviceable hubs.
        </p>
      </div>

      {/* Illustration */}
      <div className="flex-1 flex items-center justify-center my-8">
        <div className="relative w-full aspect-square max-w-sm">
          <div className="absolute inset-6 rounded-3xl bg-primary/10" />
          <svg viewBox="0 0 300 300" className="relative w-full h-full">
            {/* Streets */}
            <path d="M0 200 Q150 180 300 200" stroke="hsl(var(--border))" strokeWidth="20" fill="none" opacity="0.4" />
            <path d="M150 0 Q170 150 150 300" stroke="hsl(var(--border))" strokeWidth="20" fill="none" opacity="0.4" />
            {/* Highlighted plot */}
            <rect x="90" y="110" width="120" height="100" rx="8" fill="hsl(var(--primary))" opacity="0.25" />
            {/* Buildings */}
            <rect x="60" y="60" width="40" height="80" fill="hsl(var(--muted-foreground))" opacity="0.5" rx="3" />
            <rect x="110" y="50" width="50" height="120" fill="hsl(var(--muted-foreground))" opacity="0.7" rx="3" />
            <rect x="170" y="80" width="45" height="90" fill="hsl(var(--muted-foreground))" opacity="0.55" rx="3" />
            <rect x="225" y="100" width="40" height="70" fill="hsl(var(--muted-foreground))" opacity="0.45" rx="3" />
            <rect x="40" y="180" width="35" height="60" fill="hsl(var(--muted-foreground))" opacity="0.5" rx="3" />
            <rect x="220" y="200" width="45" height="55" fill="hsl(var(--muted-foreground))" opacity="0.5" rx="3" />
            {/* Trees */}
            <circle cx="35" cy="120" r="8" fill="hsl(var(--primary))" opacity="0.55" />
            <circle cx="270" cy="160" r="9" fill="hsl(var(--primary))" opacity="0.55" />
            <circle cx="140" cy="240" r="7" fill="hsl(var(--primary))" opacity="0.55" />
            <circle cx="195" cy="40" r="7" fill="hsl(var(--primary))" opacity="0.5" />
          </svg>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          onClick={useGPS}
          disabled={locating}
          size="lg"
          className="w-full h-14 rounded-2xl text-base font-semibold"
        >
          {locating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Navigation className="mr-2 h-5 w-5" />}
          Use current location
        </Button>
        <Button
          onClick={() => navigate({ to: "/c/location/search" })}
          variant="ghost"
          size="lg"
          className="w-full h-12 text-base font-bold text-primary hover:text-primary"
        >
          Enter location manually
        </Button>
      </div>
    </div>
  );
}
