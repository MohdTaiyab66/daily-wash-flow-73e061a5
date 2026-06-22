import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Car } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";

export const Route = createFileRoute("/c/_authed/vehicles")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Vehicles — Urban Wash" }] }),
  component: VehiclesPage,
});

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  color: string | null;
  image_url?: string | null;
};

function VehiclesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from("customer_vehicles")
        .select("*")
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as Vehicle[];
      const catalogImages = await Promise.all(
        rows.map(async (v) => {
          const { data: img } = await supabase
            .from("vehicle_catalog")
            .select("image_url")
            .ilike("make", v.make)
            .ilike("model", v.model)
            .limit(1)
            .maybeSingle();
          return { ...v, image_url: img?.image_url ?? null };
        }),
      );
      return catalogImages;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle removed");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  return (
    <div className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
        <Button asChild size="sm">
          <Link to="/c/vehicles/add">
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Link>
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {q.isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <Car className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No vehicles yet.</p>
            <Button asChild className="mt-4">
              <Link to="/c/vehicles/add">Add your first vehicle</Link>
            </Button>
          </div>
        )}
        {(q.data ?? []).map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <VehicleAvatar
              imageUrl={v.image_url}
              make={v.make}
              model={v.model}
              color={v.color}
              className="h-14 w-16 rounded-2xl"
            />
            <div className="min-w-0">
              <div className="font-semibold">
                {v.make} {v.model}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {v.registration_number}
                {v.color ? ` · ${v.color}` : ""} · {v.model.toUpperCase()} —{" "}
                {vehicleBodyLabel(v.make, v.model, v.category)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => confirm(`Remove ${v.make} ${v.model}?`) && del.mutate(v.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
