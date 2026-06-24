import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Car, Calendar, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { readGuestCart, writeGuestCart, setPendingRedirect } from "@/lib/guest-cart";
import { track } from "@/lib/funnel";

export const Route = createFileRoute("/c/g/checkout")({
  ssr: false,
  head: () => ({ meta: [{ title: "Review booking — Urban Wash" }] }),
  component: GuestCheckout,
});

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM"];

function GuestCheckout() {
  const navigate = useNavigate();
  const cart = readGuestCart();
  const [date, setDate] = useState<string>(cart.date ?? (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })());
  const [slot, setSlot] = useState<string>(cart.slot ?? TIME_SLOTS[3]);
  const [area, setArea] = useState<string>("");
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setArea(localStorage.getItem("uw_customer_area") ?? "");
    track("booking_started", { slug: cart.serviceSlug, category: cart.vehicleCategory });
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session?.user?.email?.endsWith("@customer.urbanwash.app"));
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serviceQ = useQuery({
    queryKey: ["public-service", cart.serviceSlug],
    enabled: !!cart.serviceSlug,
    queryFn: async () => {
      const { data } = await supabase.from("service_catalog")
        .select("*").eq("slug", cart.serviceSlug!).maybeSingle();
      return data;
    },
  });

  const s: any = serviceQ.data;
  const isSUV = cart.vehicleCategory === "sedan_suv";
  const price = s ? (isSUV ? s.price_sedan_suv : s.price_hatchback) : 0;

  const pay = () => {
    writeGuestCart({ date, slot });
    if (signedIn) {
      // hand off to the full authenticated booking page, prefilled
      navigate({ to: "/c/service/$slug", params: { slug: cart.serviceSlug! } });
      return;
    }
    setPendingRedirect("/c/g/checkout");
    navigate({ to: "/c/welcome", search: { redirect: "/c/g/checkout" } as any });
  };

  if (!cart.serviceSlug) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Link to="/c/services" className="mt-3 inline-block text-primary font-semibold underline">
            Browse services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/c/services" className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-semibold tracking-tight">Review booking</h1>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-3">
        {/* Service card */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Service</p>
          {serviceQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mt-2" />
          ) : (
            <>
              <h2 className="mt-1 text-base font-semibold">{s?.name}</h2>
              <p className="text-xs text-muted-foreground">{isSUV ? "Sedan / SUV" : "Hatchback"}</p>
            </>
          )}
        </div>

        {/* Vehicle (guest) */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vehicle</p>
          </div>
          <p className="mt-1 text-sm font-semibold">
            {isSUV ? "Sedan / SUV" : "Hatchback"}
          </p>
          <p className="text-xs text-muted-foreground">
            You'll add registration after login.
          </p>
        </div>

        {/* Address */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Address</p>
          </div>
          <p className="mt-1 text-sm font-semibold">{area || "Pick area"}</p>
          <button
            onClick={() => navigate({ to: "/c/location" })}
            className="mt-1 text-xs text-primary font-medium"
          >
            Change
          </button>
        </div>

        {/* Date / slot */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">When</p>
          </div>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TIME_SLOTS.map((t) => (
              <button
                key={t}
                onClick={() => setSlot(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                  slot === t ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Service</span>
            <span className="text-sm font-medium">₹{price}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold">₹{price}</span>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="text-lg font-bold">₹{price}</p>
          </div>
          <Button
            size="lg"
            className="h-12 rounded-2xl px-5 font-semibold"
            onClick={pay}
            disabled={checking || !area}
          >
            {!signedIn && <Lock className="mr-1.5 h-4 w-4" />}
            {signedIn ? "Proceed to pay" : "Login & Pay"}
          </Button>
        </div>
        {!signedIn && (
          <p className="px-4 pb-3 text-center text-[11px] text-muted-foreground">
            Quick OTP login — your booking is saved.
          </p>
        )}
      </div>
    </div>
  );
}
