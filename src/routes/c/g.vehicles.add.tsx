import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Search, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { writeGuestCart } from "@/lib/guest-cart";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { track } from "@/lib/funnel";
import { toast } from "sonner";

export const Route = createFileRoute("/c/g/vehicles/add")({
  ssr: false,
  head: () => ({ meta: [{ title: "Add vehicle — Urban Wash" }] }),
  component: AddGuestVehicle,
});

type CatalogRow = {
  id: string;
  make: string;
  model: string;
  category: string;
  image_url: string | null;
};

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "hatchback_compact_sedan", label: "Hatchback / Compact" },
  { key: "sedan_suv", label: "Sedan / SUV" },
] as const;

function AddGuestVehicle() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["key"]>("all");
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [color, setColor] = useState("");
  const [reg, setReg] = useState("");

  const catalogQ = useQuery({
    queryKey: ["vehicle-catalog-guest"],
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select("id,make,model,category,image_url")
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

  const save = () => {
    if (!selected) return;
    // DB lookup wins; fall back to keyword map.
    const cat = (selected.category === "sedan_suv" ? "sedan_suv" : "hatchback_compact_sedan") as
      | "sedan_suv"
      | "hatchback_compact_sedan";
    const bodyLabel = vehicleBodyLabel(selected.make, selected.model, selected.category);
    writeGuestCart({
      vehicle: {
        catalogId: selected.id,
        make: selected.make,
        model: selected.model,
        category: cat,
        bodyLabel,
        color: color.trim() || undefined,
        registration: reg.trim().toUpperCase() || undefined,
        imageUrl: selected.image_url,
      },
      vehicleCategory: cat === "sedan_suv" ? "sedan_suv" : "hatchback",
    });
    track("vehicle_added_guest", { make: selected.make, model: selected.model, category: cat });
    toast.success("Vehicle added");
    navigate({ to: "/c/g/vehicles" });
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/c/g/vehicles" className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-semibold tracking-tight">Add vehicle</h1>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search make or model"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto -mx-1 px-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${
                  cat === c.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {brands.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto -mx-1 px-1">
              <button
                onClick={() => setBrand(null)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium border ${
                  brand === null ? "bg-foreground text-background border-foreground" : "border-border"
                }`}
              >
                All brands
              </button>
              {brands.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium border ${
                    brand === b ? "bg-foreground text-background border-foreground" : "border-border"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        {catalogQ.isLoading ? (
          <div className="h-40 grid place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No vehicles match.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {filtered.slice(0, 200).map((r) => {
              const isSel = selected?.id === r.id;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                      isSel ? "bg-primary/5" : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-xs font-semibold">
                      {r.make.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.make} {r.model}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {vehicleBodyLabel(r.make, r.model, r.category)}
                      </p>
                    </div>
                    {isSel && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-md p-4 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Selected</p>
              <p className="text-sm font-semibold">
                {selected.make} {selected.model}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({vehicleBodyLabel(selected.make, selected.model, selected.category)})
                </span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Color (optional)</Label>
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="White"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-[11px]">Registration (optional)</Label>
                <Input
                  value={reg}
                  onChange={(e) => setReg(e.target.value.toUpperCase())}
                  placeholder="UP32 AB 1234"
                  className="h-10 uppercase"
                />
              </div>
            </div>
            <Button onClick={save} className="w-full h-12 rounded-xl text-base font-semibold">
              Save vehicle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
