import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Car } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/_authed/vehicles")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Vehicles — Urban Wash" }] }),
  component: VehiclesRoute,
});

type Vehicle = { id: string; make: string; model: string; category: string; registration_number: string; color: string | null };

function VehiclesRoute() {
  const { pathname } = useLocation();

  return pathname === "/c/vehicles" ? <VehiclesPage /> : <Outlet />;
}

function VehiclesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await (supabase as any).from("customer_vehicles").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("customer_vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle removed");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });

  return (
    <div className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
        <Button asChild size="sm"><Link to="/c/vehicles/add"><Plus className="mr-1 h-4 w-4" />Add</Link></Button>
      </div>

      <div className="mt-5 space-y-3">
        {q.isLoading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <Car className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No vehicles yet.</p>
            <Button asChild className="mt-4"><Link to="/c/vehicles/add">Add your first vehicle</Link></Button>
          </div>
        )}
        {(q.data ?? []).map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="font-semibold">{v.make} {v.model}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {v.registration_number}{v.color ? ` · ${v.color}` : ""} · {v.category === "sedan_suv" ? "Sedan / SUV" : "Hatchback / Compact"}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => confirm(`Remove ${v.make} ${v.model}?`) && del.mutate(v.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
