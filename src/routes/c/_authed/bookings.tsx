import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarDays, HelpCircle, ChevronRight, Car, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VehicleSelector, useSelectedVehicleId, type SelectorVehicle } from "@/components/customer/VehicleSelector";
import { EmptyState } from "@/components/customer/ui/EmptyState";
import { statusTone, StatusChip, Surface } from "@/components/customer/ui/kit";
import { SkeletonList } from "@/components/customer/ui/Skeletons";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { UWBookingCard } from "@/components/customer/ui/UWBookingCard";
import { UWHeader } from "@/components/customer/ui/UWHeader";


export const Route = createFileRoute("/c/_authed/bookings")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Bookings — Urban Wash" }] }),
  component: BookingsRoute,
});

type Tab = "upcoming" | "completed" | "cancelled";
type Row = {
  id: string;
  scheduled_date: string;
  preferred_before_time: string | null;
  status: string;
  payment_status: string | null;
  total_amount: number;
  vehicle_id: string | null;
  service_catalog: { name: string; slug: string } | null;
};

function BookingsRoute() {
  const { pathname } = useLocation();
  if (pathname !== "/c/bookings") return <Outlet />;
  return <BookingsPage />;
}

function BookingsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<SelectorVehicle[]> => {
      const { data } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, registration_number, is_default")
        .order("created_at");
      return (data ?? []) as SelectorVehicle[];
    },
  });

  const [selectedVehicleId, setSelectedVehicleId] = useSelectedVehicleId(vehiclesQ.data);
  const hasVehicles = (vehiclesQ.data?.length ?? 0) > 0;

  const q = useQuery({
    queryKey: ["customer-bookings", tab, selectedVehicleId],
    enabled: !!selectedVehicleId,
    queryFn: async (): Promise<Row[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, preferred_before_time, status, payment_status, total_amount, vehicle_id, service_catalog:service_id(name, slug)")
        .eq("vehicle_id", selectedVehicleId)
        .order("scheduled_date", { ascending: tab === "upcoming" })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      if (tab === "upcoming") {
        return rows.filter((r) => r.scheduled_date >= today && !["completed", "cancelled"].includes(r.status.toLowerCase()));
      }
      if (tab === "completed") {
        return rows.filter((r) => r.status.toLowerCase() === "completed");
      }
      if (tab === "cancelled") {
        return rows.filter((r) => ["cancelled", "canceled", "failed", "rejected"].includes(r.status.toLowerCase()));
      }
      return rows;
    },
  });

  const items = q.data ?? [];
  const qc = useQueryClient();

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["customer-bookings"] })}>
      <div className="min-h-screen bg-[#FFF9F3] pb-24">
        {/* Header */}
        <div className="bg-[#FFF9F3] pt-2">
          <UWHeader 
            unread={0}
            area={vehiclesQ.data?.find(v => v.id === selectedVehicleId)?.registration_number ?? "My Bookings"}
            onAreaClick={() => {}}
          />
        </div>

        {/* Tabs - Marketplace Style */}
        <div className="sticky top-0 z-20 bg-[#FFF9F3]/80 backdrop-blur-md px-5 py-3">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
            {(["upcoming", "completed", "cancelled"] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-none rounded-full px-5 py-2 text-[13px] font-bold capitalize transition-all",
                    active 
                      ? "bg-black text-white shadow-md shadow-black/10" 
                      : "bg-white text-foreground/70 border border-border/50"
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>


        <div className="px-5">
          {!hasVehicles && !vehiclesQ.isLoading ? (
            <div className="mt-12">
              <EmptyState
                icon={Car}
                tone="primary"
                title="No vehicle added"
                description="Add your car to see and manage its bookings."
                action={
                  <Button asChild className="h-14 rounded-2xl px-8 font-black shadow-lg shadow-primary/20 transition-all active:scale-95">
                    <Link to="/c/vehicles/add">Add vehicle</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="mt-4">
              {q.isLoading ? (
                <div className="space-y-4">
                   <div className="h-24 animate-pulse rounded-[28px] bg-white border border-black/5" />
                   <div className="h-24 animate-pulse rounded-[28px] bg-white border border-black/5" />
                   <div className="h-24 animate-pulse rounded-[28px] bg-white border border-black/5" />
                </div>
              ) : items.length === 0 ? (
                <div className="mt-12">
                  <EmptyState
                    icon={CalendarDays}
                    title={tab === "upcoming" ? "No plans for today?" : tab === "completed" ? "No service history" : "All clear here"}
                    description={
                      tab === "upcoming"
                        ? "Book a wash now and get your ride shining like new."
                        : tab === "completed"
                        ? "Your completed services will appear here for easy tracking."
                        : "Cancelled or failed bookings are moved here."
                    }
                    action={
                      <Button asChild className="h-14 rounded-2xl px-8 font-black shadow-lg shadow-primary/20 transition-all active:scale-95">
                        <Link to="/c/home">Book a Wash</Link>
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-3 pb-10">
                  {items.map((b) => {
                    const st = statusTone(b.status);
                    
                    let dateLabel = b.scheduled_date;
                    if (b.scheduled_date) {
                      const when = new Date(`${b.scheduled_date}T00:00:00`);
                      if (!isNaN(when.getTime())) {
                        dateLabel = when.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                      }
                    }
                    
                    const isSubscription = b.service_catalog?.slug?.includes("daily-shine");
                    
                    // Simple mock mapping for redesign visual impact
                    const getServicePhoto = (slug: string) => {
                      return undefined; // NO FALLBACKS IN HISTORY EITHER DURING TEST
                    };



                    return (
                      <UWBookingCard
                        key={b.id}
                        id={b.id}
                        name={b.service_catalog?.name ?? "Service"}
                        date={dateLabel}
                        price={b.total_amount}
                        time={b.preferred_before_time ? `Before ${b.preferred_before_time}` : undefined}
                        status={{ label: st.label, tone: st.tone }}
                        isSubscription={isSubscription}
                        image={getServicePhoto(b.service_catalog?.slug ?? "")}
                        onClick={() => navigate({ to: "/c/bookings/$id", params: { id: b.id } })}
                      />
                    );
                  })}
                </div>

              )}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
