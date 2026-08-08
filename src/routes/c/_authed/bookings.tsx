import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarDays, HelpCircle, ChevronRight, Car, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VehicleSelector, useSelectedVehicleId, type SelectorVehicle } from "@/components/customer/VehicleSelector";
import { EmptyState } from "@/components/customer/ui/EmptyState";
import { statusTone, StatusChip } from "@/components/customer/ui/kit";
import { SkeletonList } from "@/components/customer/ui/Skeletons";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";

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
      return rows.filter((r) => ["cancelled", "canceled", "failed", "rejected"].includes(r.status.toLowerCase()));
    },
  });

  const items = q.data ?? [];
  const qc = useQueryClient();

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["customer-bookings"] })}>
      <div className="min-h-screen bg-[#FFF9F3] pb-24">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-[#FFF9F3]/90 px-5 pt-8 pb-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">Bookings</h1>
              <p className="mt-1 text-[13px] font-bold text-muted-foreground/50 uppercase tracking-widest">Service History</p>
            </div>
            <div className="flex items-center gap-2">
              {hasVehicles && (
                <VehicleSelector
                  vehicles={vehiclesQ.data ?? []}
                  value={selectedVehicleId}
                  onChange={setSelectedVehicleId}
                />
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-8 flex gap-3 overflow-x-auto no-scrollbar">
            {(["upcoming", "completed", "cancelled"] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-none rounded-2xl px-6 py-3 text-[14px] font-black capitalize transition-all",
                    active 
                      ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" 
                      : "bg-white text-[#1a1a1a] shadow-sm border border-black/5"
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
                <div className="space-y-4 pb-10">
                  {items.map((b) => {
                    const st = statusTone(b.status);
                    const when = new Date(`${b.scheduled_date}T00:00:00`);
                    const dateLabel = isNaN(when.getTime())
                      ? b.scheduled_date
                      : when.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                    
                    const isSubscription = b.service_catalog?.slug?.includes("daily-shine");

                    return (
                      <button
                        key={b.id}
                        onClick={() => navigate({ to: "/c/bookings/$id", params: { id: b.id } })}
                        className="group flex w-full items-center gap-4 rounded-[32px] border border-black/5 bg-white p-5 text-left shadow-sm transition-all active:scale-[0.98] hover:shadow-md"
                      >
                        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-[#FFF9F3] border border-black/5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/50">
                            {dateLabel.split(" ")[1] ?? ""}
                          </span>
                          <span className="text-[20px] font-black leading-tight text-[#1a1a1a]">
                            {dateLabel.split(" ")[0]}
                          </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                             <span className="truncate text-[16px] font-black text-[#1a1a1a]">
                               {b.service_catalog?.name ?? "Service"}
                             </span>
                             {isSubscription && (
                               <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                                 <Sparkles className="h-3 w-3 text-primary" />
                               </div>
                             )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[13px] font-bold text-muted-foreground/60">
                            <span>₹{b.total_amount}</span>
                            <div className="h-1 w-1 rounded-full bg-black/10" />
                            <span>{b.preferred_before_time ? `Before ${b.preferred_before_time}` : "Flexible time"}</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                           <StatusChip tone={st.tone} className="rounded-xl px-3 py-1 font-black text-[10px] uppercase tracking-wider">{st.label}</StatusChip>
                           <ChevronRight className="h-5 w-5 text-muted-foreground/30 transition-transform group-hover:translate-x-1" />
                        </div>
                      </button>
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
