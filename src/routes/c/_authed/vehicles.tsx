import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Car, ChevronRight, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { useVehicleImageUrl } from "@/lib/vehicle-image";

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
  image_path: string | null;
  is_default: boolean | null;
  nickname: string | null;
};

function VehiclesPage() {
  const q = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, category, registration_number, color, image_path, is_default, nickname, created_at")
        .order("is_default", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  return (
    <div className="px-5 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap a vehicle to edit its details or change photo.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/c/vehicles/add">
            <Plus className="mr-1 h-4 w-4" /> Add
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
          <VehicleRow key={v.id} v={v} />
        ))}
      </div>
    </div>
  );
}

function VehicleRow({ v }: { v: Vehicle }) {
  const imgQ = useVehicleImageUrl({ make: v.make, model: v.model, imagePath: v.image_path });
  const primary = v.nickname?.trim() || `${v.make} ${v.model}`;
  return (
    <Link
      to="/c/vehicles/$id"
      params={{ id: v.id }}
      data-testid="vehicle-row"
      data-vehicle-id={v.id}
      data-is-default={v.is_default ? "true" : "false"}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-accent/40"
    >
      <VehicleAvatar
        imageUrl={imgQ.data}
        make={v.make}
        model={v.model}
        color={v.color}
        category={v.category}
        className="h-14 w-16 rounded-2xl"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{primary}</span>
          {v.is_default && (
            <span
              data-testid="default-badge"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
            >
              <Star className="h-2.5 w-2.5" /> Default
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {v.nickname ? `${v.make} ${v.model} · ` : ""}
          {v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
