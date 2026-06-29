import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, MapPin, Navigation, Search, Loader2, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVICE_AREAS, nearestServiceArea } from "@/lib/areas";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/c/location/search")({
  ssr: false,
  head: () => ({ meta: [{ title: "Search location — Urban Wash" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
  },
  component: LocationSearch,
});

function LocationSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [outOfArea, setOutOfArea] = useState<string | null>(null);
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notified, setNotified] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return SERVICE_AREAS;
    return SERVICE_AREAS.filter((a) => a.name.toLowerCase().includes(term));
  }, [q]);

  const choose = (name: string) => {
    localStorage.setItem("uw_customer_area", name);
    localStorage.setItem("uw_customer_full_address", `${name}, Lucknow`);
    toast.success(`Location set: ${name}`);
    navigate({ to: "/c/services" });
  };

  const useGPS = () => {
    if (!("geolocation" in navigator)) { toast.error("Geolocation not available"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        // Send the user to the dedicated detect screen which uses real reverse geocoding.
        // We pass coords via sessionStorage so the next screen can reuse them without re-prompting.
        try {
          sessionStorage.setItem(
            "uw_pending_geo",
            JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() }),
          );
        } catch { /* ignore */ }
        navigate({ to: "/c/location" });
      },
      () => { setLocating(false); toast.error("Couldn't read your location"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };


  const submitWaitlist = async () => {
    if (!/^\d{10}$/.test(notifyPhone)) { toast.error("Enter a valid 10-digit phone"); return; }
    const { error } = await (supabase as any).from("expansion_requests").insert({
      phone: notifyPhone,
      area_name: q.trim() || outOfArea || "Unknown",
      interested_service: "general",
    });
    if (error) { toast.error(error.message); return; }
    setNotified(true);
  };

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      {/* Header */}
      <div className="bg-background px-5 pt-8 pb-5 flex items-center gap-4">
        <button onClick={() => navigate({ to: "/c/location" })} className="p-1 -ml-1">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold tracking-tight">Search your location</h1>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-3">
          <Search className="h-5 w-5 text-primary" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOutOfArea(null); }}
            placeholder="Search locality, sector, area"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 h-auto text-base"
          />
        </div>

        <button
          onClick={useGPS}
          disabled={locating}
          className="w-full flex items-center justify-between rounded-xl bg-card px-4 py-4 ring-1 ring-border hover:bg-accent/40"
        >
          <span className="flex items-center gap-3">
            {locating ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Navigation className="h-5 w-5 text-primary" />}
            <span className="font-semibold text-primary">Use current location</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <div className="px-5 pt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Serviceable areas</h2>
      </div>

      <div className="flex-1 px-5 pt-3 pb-6 space-y-2 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="rounded-2xl bg-card ring-1 ring-border p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Coming soon to "{q}"</h3>
            <p className="mt-1 text-xs text-muted-foreground">Drop your number — we'll text you when we launch.</p>
            {!notified ? (
              <div className="mt-4 flex gap-2">
                <div className="flex flex-1">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-card px-2.5 text-xs text-muted-foreground">+91</span>
                  <Input
                    value={notifyPhone}
                    onChange={(e) => setNotifyPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    inputMode="numeric"
                    maxLength={10}
                    className="rounded-l-none rounded-r-lg"
                  />
                </div>
                <Button onClick={submitWaitlist}><BellRing className="mr-1 h-4 w-4" />Notify</Button>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-primary">You're on the list ✓</p>
            )}
          </div>
        )}

        {filtered.map((a) => (
          <button
            key={a.name}
            onClick={() => choose(a.name)}
            className="w-full flex items-center justify-between rounded-xl bg-card px-4 py-3.5 ring-1 ring-border hover:bg-accent/40 text-left"
          >
            <span className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{a.name}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
