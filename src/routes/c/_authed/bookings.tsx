import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarDays, HelpCircle, ChevronRight, Car } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

type Tab = "upcoming" | "previous";
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
      return tab === "upcoming"
        ? rows.filter((r) => r.scheduled_date >= today && !["completed", "cancelled"].includes(r.status))
        : rows.filter((r) => r.scheduled_date < today || ["completed", "cancelled"].includes(r.status));
    },
  });

  const items = q.data ?? [];
  const qc = useQueryClient();

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["customer-bookings"] })}>
    <div className="px-5 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold tracking-tight">Bookings</h1>
        <div className="flex items-center gap-2">
          {hasVehicles && (
            <VehicleSelector
              vehicles={vehiclesQ.data ?? []}
              value={selectedVehicleId}
              onChange={setSelectedVehicleId}
            />
          )}
          <Button variant="outline" size="sm" className="rounded-full">
            <HelpCircle className="mr-1.5 h-4 w-4" /> Help
          </Button>
        </div>
      </div>

      {!hasVehicles && !vehiclesQ.isLoading ? (
        <EmptyState
          className="mt-10"
          icon={Car}
          tone="primary"
          title="No vehicle added"
          description="Add your car to see and manage its bookings."
          action={
            <Button asChild className="h-11 rounded-full px-7 font-semibold">
              <Link to="/c/vehicles/add">Add vehicle</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-5 rounded-full border border-border bg-card p-1 flex">
            {(["upcoming", "previous"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-full py-2.5 text-sm font-medium capitalize transition-colors ${
                  tab === t ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-8">
            {q.isLoading ? (
              <SkeletonList count={3} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={tab === "upcoming" ? "No upcoming bookings" : "No past bookings"}
                description={
                  tab === "upcoming"
                    ? "Book a wash and it will appear here with live status."
                    : "Completed and cancelled services will be listed here."
                }
                action={
                  <Button asChild className="h-11 rounded-full px-7 font-semibold">
                    <Link to="/c/home">Browse services</Link>
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
                {items.map((b) => {
                  const st = statusTone(b.status);
                  const when = new Date(`${b.scheduled_date}T00:00:00`);
                  const dateLabel = isNaN(when.getTime())
                    ? b.scheduled_date
                    : when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
                  return (
                    <button
                      key={b.id}
                      onClick={() => navigate({ to: "/c/bookings/$id", params: { id: b.id } })}
                      className="uw-pressable flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-muted/50"
                    >
                      <div className="w-12 shrink-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {dateLabel.split(" ")[1] ?? ""}
                        </div>
                        <div className="text-[18px] font-bold leading-tight">{dateLabel.split(" ")[0]}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold">
                          {b.service_catalog?.name ?? "Service"}
                        </div>
                        <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                          ₹{b.total_amount}
                          {b.preferred_before_time ? ` · before ${b.preferred_before_time}` : ""}
                        </div>
                      </div>
                      <StatusChip tone={st.tone}>{st.label}</StatusChip>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </PullToRefresh>
  );
}
