import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Search, Navigation, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { SERVICE_AREAS, SERVICE_AREA_NAMES, nearestServiceArea } from "@/lib/areas";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpeg";

export const Route = createFileRoute("/c/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Urban Wash — Doorstep Car Care" },
      { name: "description", content: "Daily car cleaning subscriptions in Lucknow. Choose your area, pick a plan, and we'll take care of your car every morning." },
      { property: "og:title", content: "Urban Wash — Doorstep Car Care" },
      { property: "og:description", content: "Daily doorstep car cleaning in Lucknow." },
    ],
  }),
  component: CustomerLanding,
});

const SUPPORTED = new Set(SERVICE_AREA_NAMES.map((s) => s.toLowerCase()));

function CustomerLanding() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [outOfArea, setOutOfArea] = useState<string | null>(null);
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notified, setNotified] = useState(false);

  // Skip ahead if a saved area + session exist
  useEffect(() => {
    (async () => {
      const saved = localStorage.getItem("uw_customer_area");
      const { data } = await supabase.auth.getSession();
      if (saved && data.session) navigate({ to: "/c/home" });
    })();
  }, [navigate]);

  const pickArea = (name: string) => {
    localStorage.setItem("uw_customer_area", name);
    navigate({ to: "/c/auth" });
  };

  const useGPS = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not available");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const a = nearestServiceArea(p.coords.latitude, p.coords.longitude);
        const dx = Math.hypot(a.lat - p.coords.latitude, a.lng - p.coords.longitude);
        if (dx > 0.15) {
          setOutOfArea("your current location");
          return;
        }
        pickArea(a.name);
      },
      () => {
        setLocating(false);
        toast.error("Couldn't read your location");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submitWaitlist = async () => {
    if (!/^\d{10}$/.test(notifyPhone)) {
      toast.error("Enter a valid 10-digit phone");
      return;
    }
    const { error } = await (supabase as any).from("area_waitlist").insert({
      phone: notifyPhone,
      area: outOfArea ?? q ?? "Unknown",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNotified(true);
  };

  const filtered = q
    ? SERVICE_AREAS.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
    : SERVICE_AREAS;
  const matchesSupported = q && SUPPORTED.has(q.toLowerCase());
  const showOutOfArea = q.trim().length >= 3 && filtered.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col px-5 pt-10 pb-12">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="Urban Wash" className="h-10 w-10 rounded-xl object-cover" />
          <span className="text-lg font-semibold tracking-tight">Urban Wash</span>
        </div>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Where do you need us?</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We're live across Lucknow. Pick your area to continue.
        </p>

        <Button
          onClick={useGPS}
          disabled={locating}
          variant="outline"
          className="mt-6 h-12 justify-start gap-3 rounded-2xl border-primary/30 text-primary"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          Use my current location
        </Button>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOutOfArea(null); setNotified(false); }}
            placeholder="Search area, e.g. Gomti Nagar"
            className="h-12 rounded-2xl pl-10"
          />
        </div>

        {!outOfArea && !showOutOfArea && (
          <div className="mt-5 space-y-2">
            {filtered.map((a) => (
              <button
                key={a.name}
                onClick={() => pickArea(a.name)}
                className="group flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">Lucknow · serviceable</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
            {matchesSupported && null}
          </div>
        )}

        {(outOfArea || showOutOfArea) && (
          <div className="mt-6 rounded-3xl border border-border bg-card p-5 text-center">
            {!notified ? (
              <>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
                  <MapPin className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-base font-semibold">Urban Wash is coming soon</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We're not in {outOfArea ?? `"${q}"`} yet. Leave your number and we'll notify you the moment we launch.
                </p>
                <div className="mt-4 flex gap-2">
                  <div className="flex flex-1">
                    <span className="inline-flex items-center rounded-l-xl border border-r-0 border-input bg-muted px-3 text-xs text-muted-foreground">+91</span>
                    <Input
                      value={notifyPhone}
                      onChange={(e) => setNotifyPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="98765 43210"
                      inputMode="numeric"
                      maxLength={10}
                      className="rounded-l-none rounded-r-xl"
                    />
                  </div>
                  <Button onClick={submitWaitlist}>Notify me</Button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-success/15 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-base font-semibold">You're on the list</h2>
                <p className="mt-1 text-sm text-muted-foreground">We'll text you the moment Urban Wash launches in your area.</p>
              </>
            )}
          </div>
        )}

        <div className="mt-10 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          Already a partner?
          <Link to="/auth" className="font-medium text-primary">Open Partner App</Link>
        </div>
      </div>
    </div>
  );
}
