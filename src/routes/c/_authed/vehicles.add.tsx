import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Search, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/c/_authed/vehicles/add")({
  ssr: false,
  head: () => ({ meta: [{ title: "Add Vehicle — Urban Wash" }] }),
  component: AddVehicle,
});

type CatalogRow = { id: string; make: string; model: string; category: string };

function AddVehicle() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [color, setColor] = useState("");
  const [reg, setReg] = useState("");
  const [parking, setParking] = useState("");

  const catalogQ = useQuery({
    queryKey: ["vehicle-catalog", query],
    queryFn: async (): Promise<CatalogRow[]> => {
      let qb = (supabase as any).from("vehicle_catalog").select("id,make,model,category").eq("active", true).order("make").limit(40);
      if (query.trim().length >= 1) {
        const term = `%${query.trim()}%`;
        qb = qb.or(`make.ilike.${term},model.ilike.${term}`);
      }
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a car first");
      if (reg.trim().length < 4) throw new Error("Enter registration number");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("customer_vehicles").insert({
        user_id: u.user.id,
        make: selected.make,
        model: selected.model,
        category: selected.category,
        color: color.trim() || null,
        registration_number: reg.trim().toUpperCase(),
        parking_notes: parking.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle added");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      navigate({ to: "/c/home" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  return (
    <div className="px-5 pt-6">
      <button onClick={() => navigate({ to: "/c/vehicles" })} className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Add a vehicle</h1>
      <p className="mt-1 text-sm text-muted-foreground">We'll automatically pick the right pricing tier.</p>

      {!selected ? (
        <>
          <div className="relative mt-5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. Fortuner, Swift, Creta"
              className="h-12 rounded-2xl pl-10"
            />
          </div>
          <div className="mt-3 space-y-1.5">
            {catalogQ.isLoading && <div className="h-20 animate-pulse rounded-2xl bg-muted" />}
            {(catalogQ.data ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/40 hover:bg-accent"
              >
                <div>
                  <div className="text-sm font-semibold">{c.make} {c.model}</div>
                  <div className="text-[11px] text-muted-foreground">{c.category === "sedan_suv" ? "Sedan / SUV" : "Hatchback / Compact"}</div>
                </div>
                <span className="text-xs text-primary">Select</span>
              </button>
            ))}
            {!catalogQ.isLoading && (catalogQ.data ?? []).length === 0 && (
              <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                No matches. Try a different keyword — or contact support to add your model.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-primary/30 bg-accent/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">{selected.make} {selected.model}</div>
                <div className="text-xs text-muted-foreground">
                  Auto-classified: {selected.category === "sedan_suv" ? "Sedan / SUV" : "Hatchback / Compact"}
                </div>
              </div>
              <Check className="h-5 w-5 text-primary" />
            </div>
            <button className="mt-2 text-xs text-muted-foreground underline" onClick={() => setSelected(null)}>
              Change car
            </button>
          </div>

          <div>
            <Label>Registration number</Label>
            <Input value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} placeholder="UP 32 AB 1234" className="mt-1.5" />
          </div>
          <div>
            <Label>Colour (optional)</Label>
            <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="White" className="mt-1.5" />
          </div>
          <div>
            <Label>Parking notes (optional)</Label>
            <Input value={parking} onChange={(e) => setParking(e.target.value)} placeholder="B-block basement, slot 14" className="mt-1.5" />
          </div>

          <Button size="lg" className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save vehicle
          </Button>
        </div>
      )}
    </div>
  );
}
