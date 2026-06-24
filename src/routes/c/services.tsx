import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  MapPin,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Droplets,
  ShowerHead,
  Wrench,
  Plus,
  Home as HomeIcon,
  CalendarDays,
  Calendar,
  User,
  Check,
  Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/c/services")({
  ssr: false,
  head: () => ({ meta: [{ title: "Urban Wash" }] }),
  component: PublicHome,
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
  duration_minutes: number | null;
};

const ICONS: Record<string, LucideIcon> = {
  "daily-shine": Sparkles,
  "one-time-wash-basic": Droplets,
  "one-time-wash-premium": ShowerHead,
  "deep-clean": Wrench,
  "interior-deep-clean": Wrench,
};

const PLAN_INCLUDED = ["daily-shine-exterior", "daily-shine-interior", "daily-shine-dusting"];

function PublicHome() {
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

  const services = (servicesQ.data ?? []).filter((s) => !PLAN_INCLUDED.includes(s.slug));
  const subscription = services.find((s) => s.service_type === "subscription");
  const oneTime = services.filter((s) => s.service_type !== "subscription");

  const goLogin = () => navigate({ to: "/c/welcome" });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-5 pt-6">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => {
              try { localStorage.removeItem("uw_customer_area"); } catch {}
              navigate({ to: "/c/location" });
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{area || "Pick area"}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={goLogin}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add vehicle
          </button>
        </div>

        {/* Add vehicle hero */}
        <button
          onClick={goLogin}
          className="mt-4 flex w-full items-center justify-between rounded-3xl border border-border bg-gradient-to-br from-accent/60 to-card p-5 text-left"
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Add your car</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Get started in 30 seconds</h2>
            <p className="mt-1 text-xs text-muted-foreground">Login to add your vehicle and see pricing.</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Plus className="h-5 w-5" />
          </span>
        </button>

        {/* Subscription */}
        {subscription && (
          <section className="mt-7">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-base font-semibold tracking-tight">Subscribe & save</h3>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Best value</span>
            </div>
            <button
              onClick={goLogin}
              className="relative block w-full overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-accent/40 to-card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    <Sparkles className="h-3 w-3" /> Daily plan
                  </span>
                  <h4 className="mt-2 text-xl font-semibold tracking-tight">{subscription.name}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{subscription.description}</p>
                </div>
                <Sparkles className="h-8 w-8 shrink-0 text-primary/70" />
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-border/60 pt-3">
                <div>
                  <span className="text-2xl font-bold">₹{subscription.price_hatchback}</span>
                  <span className="ml-1 text-xs text-muted-foreground">/month</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  View plan <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          </section>
        )}

        {/* One-time washes */}
        {oneTime.length > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-base font-semibold tracking-tight">One-time washes</h3>
            </div>
            <div className="space-y-2.5">
              {servicesQ.isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
                ))}
              {oneTime.map((s) => {
                const Icon = ICONS[s.slug] ?? Droplets;
                return (
                  <button
                    key={s.id}
                    onClick={goLogin}
                    className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold">{s.name}</h4>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{s.description}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="text-sm font-bold text-foreground">₹{s.price_hatchback}</span>
                        {s.duration_minutes ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" /> {s.duration_minutes} min
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Trust strip */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
          <TrustChip><Check className="h-3 w-3 text-success" /> Vetted partners</TrustChip>
          <TrustChip><Check className="h-3 w-3 text-success" /> Photo proof</TrustChip>
          <TrustChip><Check className="h-3 w-3 text-success" /> Pay after</TrustChip>
        </div>
      </div>

      {/* Bottom nav (login-gated) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
          <NavItem icon={HomeIcon} label="Home" active onClick={() => {}} />
          <NavItem icon={CalendarDays} label="My Plan" onClick={goLogin} />
          <NavItem icon={Calendar} label="Bookings" onClick={goLogin} />
          <NavItem icon={User} label="Profile" onClick={goLogin} />
        </div>
      </nav>
    </div>
  );
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-full border border-border bg-card px-2 py-1.5">
      {children}
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </button>
  );
}
