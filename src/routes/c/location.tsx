import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Navigation, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";
import { getCurrentGps } from "@/lib/native";

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
  const [denied, setDenied] = useState(false);
  const reverse = useServerFn(reverseGeocode);

  const persist = async (loc: {
    lat: number;
    lng: number;
    address_line: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    formatted_address: string;
  }) => {
    // Local fast-path for UI
    localStorage.setItem("uw_customer_area", loc.area || loc.city || "Your area");
    localStorage.setItem("uw_customer_full_address", loc.formatted_address);
    localStorage.setItem(
      "uw_customer_geo",
      JSON.stringify({ lat: loc.lat, lng: loc.lng, pincode: loc.pincode, state: loc.state, city: loc.city }),
    );

    // Persist on the user's default address if signed in
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data: existing } = await supabase
        .from("customer_addresses")
        .select("id")
        .eq("user_id", uid)
        .eq("is_default", true)
        .maybeSingle();
      const payload = {
        user_id: uid,
        label: "Home",
        address_line: loc.address_line || loc.formatted_address,
        area: loc.area,
        pincode: loc.pincode,
        latitude: loc.lat,
        longitude: loc.lng,
        is_default: true,
      };
      const res = existing?.id
        ? await supabase.from("customer_addresses").update(payload).eq("id", existing.id)
        : await supabase.from("customer_addresses").insert(payload);
      if (res.error) throw res.error;
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.toLowerCase().includes("exact") || msg.toLowerCase().includes("gps")) {
        throw new Error("We couldn't determine your exact location. Please enable GPS or move to an open area.");
      }
      /* other errors: local copy is enough to proceed */
    }
  };

  const useGPS = async () => {
    setLocating(true);
    setDenied(false);
    const p = await getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (!p) {
      setLocating(false);
      setDenied(true);
      toast.error("Couldn't read your location. Enable location permission and try again.");
      return;
    }
        try {
          const loc = await reverse({
            data: { lat: p.lat, lng: p.lng },
          });
          await persist(loc);
          toast.success(`Detected: ${loc.area || loc.city || "your location"}`);
          navigate({ to: "/c/home" });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not detect location");
        } finally {
          setLocating(false);
        }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-12 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">What's your location?</h1>
        <p className="mt-2 text-base text-muted-foreground">
          We'll use your real GPS location to find nearby Urban Wash hubs.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center my-8">
        <div className="relative w-full aspect-square max-w-sm">
          <div className="absolute inset-6 rounded-3xl bg-primary/10 grid place-items-center">
            <MapPin className="h-20 w-20 text-primary" strokeWidth={1.5} />
          </div>
        </div>
      </div>

      {denied && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          We don't have permission to read your location. Enable it from your browser's site
          settings, or enter it manually below.
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={useGPS}
          disabled={locating}
          size="lg"
          className="w-full h-14 rounded-2xl text-base font-semibold"
        >
          {locating ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Navigation className="mr-2 h-5 w-5" />
          )}
          {denied ? "Try again" : "Use current location"}
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
