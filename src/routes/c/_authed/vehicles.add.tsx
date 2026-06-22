import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Loader2, Check, X } from "lucide-react";
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

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "hatchback_compact_sedan", label: "Hatchback / Compact" },
  { key: "sedan_suv", label: "Sedan / SUV" },
] as const;

function AddVehicle() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["key"]>("all");
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [color, setColor] = useState("");
  const [reg, setReg] = useState("");
  const [year, setYear] = useState("");
  const [variant, setVariant] = useState("");
  const [parking, setParking] = useState("");

  // Load full catalog once; filter client-side for speed.
  const catalogQ = useQuery({
    queryKey: ["vehicle-catalog-all"],
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vehicle_catalog")
        .select("id,make,model,category")
        .eq("active", true)
        .order("make")
        .order("model")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const brands = useMemo(() => {
    const s = new Set<string>();
    (catalogQ.data ?? []).forEach((r) => s.add(r.make));
    return Array.from(s).sort();
  }, [catalogQ.data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (catalogQ.data ?? []).filter((r) => {
      if (brand && r.make !== brand) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (!term) return true;
      return (
        r.make.toLowerCase().includes(term) ||
        r.model.toLowerCase().includes(term) ||
        `${r.make} ${r.model}`.toLowerCase().includes(term)
      );
    });
  }, [catalogQ.data, query, brand, cat]);

  const grouped = useMemo(() => {
    const m = new Map<string, CatalogRow[]>();
    filtered.forEach((r) => {
      const arr = m.get(r.make) ?? [];
      arr.push(r);
      m.set(r.make, arr);
    });
    return Array.from(m.entries());
  }, [filtered]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a car first");
      if (reg.trim().length < 4) throw new Error("Enter registration number");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const noteParts: string[] = [];
      if (variant.trim()) noteParts.push(`Variant: ${variant.trim()}`);
      if (year.trim()) noteParts.push(`Year: ${year.trim()}`);
      if (parking.trim()) noteParts.push(parking.trim());
      const { error } = await (supabase as any).from("customer_vehicles").insert({
        user_id: u.user.id,
        make: selected.make,
        model: selected.model,
        category: selected.category,
        color: color.trim() || null,
        registration_number: reg.trim().toUpperCase(),
        parking_notes: noteParts.join(" • ") || null,
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

  const clearFilters = () => {
    setBrand(null);
    setCat("all");
    setQuery("");
  };

  return (
    <div className="px-5 pt-6 pb-32">
      <button onClick={() => navigate({ to: "/c/vehicles" })} className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Add a vehicle</h1>
      <p className="mt-1 text-sm text-muted-foreground">Filter by brand or search — we'll set the right pricing tier.</p>

      {!selected ? (
        <>
          {/* Search */}
          <div className="relative mt-5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. Fortuner, Swift, Creta, Model Y"
              className="h-12 rounded-2xl pl-10 pr-10"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category chips */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  cat === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Brand chips */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brand</span>
              {(brand || cat !== "all" || query) && (
                <button onClick={clearFilters} className="text-[11px] text-primary underline">Clear</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setBrand(null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  brand === null ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
                }`}
              >
                All brands
              </button>
              {brands.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b === brand ? null : b)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    brand === b ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="mt-4">
            {catalogQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                No matches. Try a different keyword or brand — or contact support to add your model.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="text-[11px] text-muted-foreground">{filtered.length} model{filtered.length === 1 ? "" : "s"}</div>
                {grouped.map(([make, rows]) => (
                  <div key={make}>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{make}</div>
                    <div className="space-y-1.5">
                      {rows.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/40 hover:bg-accent"
                        >
                          <div>
                            <div className="text-sm font-semibold">{c.model}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {c.category === "sedan_suv" ? "Sedan / SUV" : "Hatchback / Compact"}
                            </div>
                          </div>
                          <span className="text-xs text-primary">Select</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Year (optional)</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="2022" inputMode="numeric" className="mt-1.5" />
            </div>
            <div>
              <Label>Colour (optional)</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="White" className="mt-1.5" />
            </div>
          </div>
          <div>
            <Label>Variant / trim (optional)</Label>
            <Input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="VXi, ZX+, Sportz, etc." className="mt-1.5" />
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
