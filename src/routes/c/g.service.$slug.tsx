import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { writeGuestCart, setPendingRedirect, readGuestCart } from "@/lib/guest-cart";

export const Route = createFileRoute("/c/g/service/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Service details — Urban Wash" }] }),
  component: GuestServiceDetail,
});

type Service = {
  id: string; slug: string; name: string; description: string;
  price_hatchback: number; price_sedan_suv: number;
  service_type: string; benefits: string[] | null; duration_minutes: number | null;
};

function GuestServiceDetail() {
  const { slug } = useParams({ from: "/c/g/service/$slug" });
  const navigate = useNavigate();
  const [category, setCategory] = useState<"hatchback" | "sedan_suv">(() => {
    const c = readGuestCart();
    if (c.vehicleCategory) return c.vehicleCategory;
    if (c.vehicle?.category === "sedan_suv") return "sedan_suv";
    return "hatchback";
  });
  const [authChecking, setAuthChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session?.user?.email?.endsWith("@customer.urbanwash.app"));
      setAuthChecking(false);
    })();
  }, []);

  const serviceQ = useQuery({
    queryKey: ["public-service", slug],
    queryFn: async (): Promise<Service | null> => {
      const { data, error } = await supabase.from("service_catalog")
        .select("*").eq("slug", slug).eq("active", true).maybeSingle();
      if (error) throw error;
      return data as Service | null;
    },
  });

  const s = serviceQ.data;
  const price = category === "sedan_suv" ? (s?.price_sedan_suv ?? 0) : (s?.price_hatchback ?? 0);

  const proceed = () => {
    if (!s) return;
    writeGuestCart({ serviceSlug: s.slug, vehicleCategory: category });
    if (signedIn) {
      // Logged-in users use the full booking page
      navigate({ to: "/c/service/$slug", params: { slug: s.slug } });
    } else {
      // Guests: show the checkout summary; login is asked only at "Pay"
      navigate({ to: "/c/g/checkout" });
    }
  };

  const askLogin = () => {
    setPendingRedirect(`/c/g/service/${slug}`);
    navigate({ to: "/c/welcome", search: { redirect: `/c/g/service/${slug}` } as any });
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/c/services" className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-semibold tracking-tight truncate">
            {s?.name ?? "Service"}
          </h1>
        </div>
      </div>

      <div className="px-5 pt-5">
        {serviceQ.isLoading || authChecking ? (
          <div className="h-40 grid place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !s ? (
          <p className="text-muted-foreground">Service not available.</p>
        ) : (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-accent/40 to-card border border-border p-5">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                <Sparkles className="h-3 w-3" /> {s.service_type === "subscription" ? "Daily plan" : "On-demand"}
              </span>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{s.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              {s.duration_minutes ? (
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {s.duration_minutes} min
                </div>
              ) : null}
            </div>

            <section className="mt-6">
              <h3 className="text-sm font-semibold">Your vehicle type</h3>
              <p className="text-xs text-muted-foreground">Pricing depends on car size.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["hatchback", "sedan_suv"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      category === c
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <p className="text-sm font-semibold">{c === "hatchback" ? "Hatchback" : "Sedan / SUV"}</p>
                    <p className="mt-1 text-base font-bold">
                      ₹{c === "hatchback" ? s.price_hatchback : s.price_sedan_suv}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {Array.isArray(s.benefits) && s.benefits.length > 0 && (
              <section className="mt-6">
                <h3 className="text-sm font-semibold">What's included</h3>
                <ul className="mt-2 space-y-2">
                  {s.benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {s && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Starting at</p>
              <p className="text-lg font-bold">₹{price}</p>
            </div>
            <Button size="lg" className="h-12 rounded-2xl px-6 font-semibold" onClick={proceed}>
              {signedIn ? "Book now" : "Continue"}
            </Button>
          </div>
          {!signedIn && (
            <div className="px-4 pb-3 text-center">
              <button onClick={askLogin} className="text-[11px] text-muted-foreground underline">
                Already have an account? Log in
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
