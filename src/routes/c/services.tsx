import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MapPin, ChevronDown, ChevronRight, Sparkles, Droplets, ShowerHead, Wrench, LogIn } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/services")({
  ssr: false,
  head: () => ({ meta: [{ title: "Our services — Urban Wash" }] }),
  component: PublicServices,
});

type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_hatchback: number;
  price_sedan_suv: number;
  service_type: string;
  sort_order: number;
};

const ICONS: Record<string, LucideIcon> = {
  "daily-shine": Sparkles,
  "one-time-wash-basic": Droplets,
  "one-time-wash-premium": ShowerHead,
  "deep-clean": Wrench,
  "interior-deep-clean": Wrench,
};

function PublicServices() {
  const navigate = useNavigate();
  const [area, setArea] = useState("");

  useEffect(() => {
    setArea(localStorage.getItem("uw_customer_area") ?? "");
  }, []);

  const servicesQ = useQuery({
    queryKey: ["public-service-catalog"],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const services = (servicesQ.data ?? []).filter(
    (s) => !["daily-shine-exterior", "daily-shine-interior", "daily-shine-dusting"].includes(s.slug),
  );
  const subscription = services.find((s) => s.service_type === "subscription");
  const oneTime = services.filter((s) => s.service_type !== "subscription");

  const goLogin = () => navigate({ to: "/c/welcome" });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-5 pt-8 pb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate({ to: "/c/location" })}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{area || "Pick area"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <Button size="sm" variant="outline" onClick={goLogin}>
          <LogIn className="h-4 w-4 mr-1.5" /> Login
        </Button>
      </div>

      <div className="px-5">
        <h1 className="text-2xl font-bold tracking-tight">Our services</h1>
        <p className="mt-1 text-sm text-muted-foreground">Explore what we offer. Login to book.</p>
      </div>

      {subscription && (
        <section className="mt-6 px-5">
          <h3 className="text-base font-semibold mb-3">Subscribe & save</h3>
          <button
            onClick={goLogin}
            className="w-full text-left rounded-3xl border border-border bg-gradient-to-br from-primary/10 to-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-semibold">{subscription.name}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{subscription.description}</p>
                <p className="mt-3 text-lg font-bold">
                  ₹{subscription.price_hatchback}
                  <span className="text-xs font-normal text-muted-foreground">/month</span>
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
            </div>
          </button>
        </section>
      )}

      <section className="mt-6 px-5">
        <h3 className="text-base font-semibold mb-3">One-time services</h3>
        <div className="space-y-2.5">
          {oneTime.map((s) => {
            const Icon = ICONS[s.slug] ?? Droplets;
            return (
              <button
                key={s.id}
                onClick={goLogin}
                className="w-full text-left flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{s.description}</span>
                </span>
                <span className="text-sm font-semibold">₹{s.price_hatchback}+</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </section>

      <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-4">
        <Button size="lg" className="w-full h-12 rounded-2xl font-semibold" onClick={goLogin}>
          Login to book
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Already exploring as a guest · <Link to="/c/welcome" className="text-primary font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
