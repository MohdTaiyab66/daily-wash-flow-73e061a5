import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  MapPin, Navigation, Loader2, CheckCircle2, Sparkles, ShieldCheck,
  Timer, Star, ArrowRight, BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { SERVICE_AREA_NAMES, nearestServiceArea } from "@/lib/areas";
import { supabase } from "@/integrations/supabase/client";
import hero from "@/assets/hero-car-wash.jpg";
import logo from "@/assets/logo.jpeg";

export const Route = createFileRoute("/c/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Urban Wash — Doorstep Car Care in Lucknow" },
      { name: "description", content: "Daily, weekly and deep-clean doorstep car wash in Lucknow. Vetted partners, before/after photos, pay only after service." },
      { property: "og:title", content: "Urban Wash — Doorstep Car Care" },
      { property: "og:description", content: "Doorstep car wash subscriptions starting at ₹999/month in Lucknow." },
    ],
  }),
  component: CustomerLanding,
});

const SUPPORTED = new Set(SERVICE_AREA_NAMES.map((s) => s.toLowerCase()));

function matchArea(address: string): string | null {
  const a = address.toLowerCase();
  for (const name of SERVICE_AREA_NAMES) {
    if (a.includes(name.toLowerCase())) return name;
  }
  return null;
}

function CustomerLanding() {
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [locating, setLocating] = useState(false);
  const [outOfArea, setOutOfArea] = useState(false);
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notified, setNotified] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      // Allow returning here to change location: only auto-skip when explicitly requested
      if (typeof window !== "undefined" && window.location.search.includes("change=1")) return;
      const saved = localStorage.getItem("uw_customer_area");
      const { data } = await supabase.auth.getSession();
      if (saved && data.session) navigate({ to: "/c/home" });
    })();
  }, [navigate]);

  const proceed = (area: string, fullAddress?: string) => {
    localStorage.setItem("uw_customer_area", area);
    if (fullAddress) localStorage.setItem("uw_customer_full_address", fullAddress);
    if (pincode) localStorage.setItem("uw_customer_pincode", pincode);
    navigate({ to: "/c/auth" });
  };

  const check = () => {
    if (address.trim().length < 8) {
      toast.error("Please enter your full address (house, street, area)");
      return;
    }
    setChecking(true);
    const matched = matchArea(address);
    setTimeout(() => {
      setChecking(false);
      if (matched) proceed(matched, address.trim());
      else setOutOfArea(true);
    }, 250);
  };

  const useGPS = () => {
    if (!("geolocation" in navigator)) { toast.error("Geolocation not available"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const a = nearestServiceArea(p.coords.latitude, p.coords.longitude);
        const dx = Math.hypot(a.lat - p.coords.latitude, a.lng - p.coords.longitude);
        if (dx > 0.15) { setOutOfArea(true); return; }
        setAddress((prev) => prev || `Near ${a.name}, Lucknow`);
        toast.success(`Detected: ${a.name}`);
      },
      () => { setLocating(false); toast.error("Couldn't read your location"); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submitWaitlist = async () => {
    if (!/^\d{10}$/.test(notifyPhone)) { toast.error("Enter a valid 10-digit phone"); return; }
    const { error } = await (supabase as any).from("area_waitlist").insert({
      phone: notifyPhone,
      area: address.trim() || "Unknown",
    });
    if (error) { toast.error(error.message); return; }
    setNotified(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md">
        {/* Hero */}
        <div className="relative overflow-hidden bg-foreground text-background">
          <div className="absolute inset-0 opacity-25">
            <img src={hero} alt="" className="h-full w-full object-cover" width={1280} height={896} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/30 via-foreground/75 to-foreground" />
          <div className="relative px-5 pb-12 pt-6">
            <div className="flex items-center gap-2.5">
              <img src={logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
              <span className="text-sm font-semibold tracking-tight">Urban Wash</span>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                <MapPin className="h-2.5 w-2.5" /> Lucknow
              </span>
            </div>

            <h1 className="mt-8 text-[30px] font-bold leading-[1.08] tracking-tight">
              Doorstep car care,
              <br />
              <span className="text-primary">every morning.</span>
            </h1>
            <p className="mt-2.5 text-[13px] leading-relaxed text-background/70">
              Subscribe once. Sparkling car before you leave for work — daily.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
              <Pill icon={<ShieldCheck className="h-3 w-3" />}>Verified</Pill>
              <Pill icon={<Timer className="h-3 w-3" />}>Before 10 AM</Pill>
              <Pill icon={<Star className="h-3 w-3" />}>4.9 ★</Pill>
            </div>
          </div>
        </div>

        {/* Address card */}
        <div className="-mt-8 px-5">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-lg shadow-foreground/5">
            <h2 className="text-base font-semibold tracking-tight">Where should we wash?</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Enter your address — we'll check serviceability.
            </p>

            <Button
              onClick={useGPS}
              disabled={locating}
              variant="outline"
              size="sm"
              className="mt-4 w-full justify-center gap-2 rounded-xl border-primary/30 text-primary hover:bg-accent"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              Use my current location
            </Button>

            <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <Textarea
              value={address}
              onChange={(e) => { setAddress(e.target.value); setOutOfArea(false); setNotified(false); }}
              placeholder="House / flat, street, area, landmark"
              rows={2}
              className="resize-none rounded-xl text-sm"
            />
            <Input
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Pincode (optional)"
              className="mt-2 rounded-xl text-sm"
            />

            {!outOfArea && (
              <Button onClick={check} disabled={checking} size="lg" className="mt-4 w-full rounded-xl font-semibold">
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Check availability <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}

            {outOfArea && (
              <div className="mt-4 rounded-2xl border border-border bg-accent/40 p-4 text-center">
                {!notified ? (
                  <>
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-card">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">Coming soon to your area</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Drop your number — we'll text you the moment we launch.
                    </p>
                    <div className="mt-3 flex gap-2">
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
                      <Button onClick={submitWaitlist} size="sm"><BellRing className="mr-1 h-3.5 w-3.5" />Notify</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-success/15 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">You're on the list</h3>
                    <p className="mt-1 text-xs text-muted-foreground">We'll text you the moment we launch.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Why */}
          <div className="mt-7">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Why Urban Wash</h3>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Feature icon={<Sparkles className="h-4 w-4" />} title="Daily shine">From ₹999/mo</Feature>
              <Feature icon={<ShieldCheck className="h-4 w-4" />} title="Trusted">Vetted partners</Feature>
              <Feature icon={<Timer className="h-4 w-4" />} title="Before 10 AM">Sleep easy</Feature>
              <Feature icon={<Star className="h-4 w-4" />} title="Photo proof">Before & after</Feature>
            </div>
          </div>

          {/* Pricing teaser */}
          <div className="mt-6 rounded-3xl border border-border bg-foreground p-5 text-background">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-primary">Plans from</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">₹999</span>
              <span className="text-sm text-background/70">/month · Hatchback</span>
            </div>
            <p className="mt-2 text-xs text-background/70">
              Daily exterior + alternate-day interior. Pause anytime.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1 pb-10 text-xs text-muted-foreground">
            Already a partner?
            <Link to="/auth" className="font-semibold text-primary">Open Partner App</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-background/10 px-2.5 py-1 backdrop-blur">
      {icon}{children}
    </span>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">{icon}</span>
      <div className="mt-2.5 text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{children}</div>
    </div>
  );
}
