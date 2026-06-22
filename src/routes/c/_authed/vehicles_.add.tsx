import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, Search, Loader2, Check, X, Car, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";

export const Route = createFileRoute("/c/_authed/vehicles_/add")({
  ssr: false,
  head: () => ({ meta: [{ title: "Add Vehicle — Urban Wash" }] }),
  component: AddVehicle,
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

function highlight(text: string, term: string) {
  if (!term) return text;
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${safe})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="rounded bg-primary/20 px-0.5 text-foreground">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function AddVehicle() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["key"]>("all");
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [color, setColor] = useState("");
  const [reg, setReg] = useState("");
  const [year, setYear] = useState("");
  const [variant, setVariant] = useState("");
  const [parking, setParking] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const catalogQ = useQuery({
    queryKey: ["vehicle-catalog-all"],
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await (supabase as any)
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

  const grouped = useMemo(() => {
    const m = new Map<string, CatalogRow[]>();
    filtered.forEach((r) => {
      const arr = m.get(r.make) ?? [];
      arr.push(r);
      m.set(r.make, arr);
    });
    return Array.from(m.entries());
  }, [filtered]);

  const hasFilters = brand !== null || cat !== "all" || query.trim().length > 0;
  const isSearching = query.trim().length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a car first");
      if (reg.trim().length < 4) throw new Error("Enter a valid registration number");
      const { data: u, error: ue } = await supabase.auth.getUser();
      if (ue) throw new Error(ue.message);
      if (!u.user) throw new Error("You're signed out. Please sign in again.");
      const noteParts: string[] = [];
      if (variant.trim()) noteParts.push(`Variant: ${variant.trim()}`);
      if (year.trim()) noteParts.push(`Year: ${year.trim()}`);
      if (parking.trim()) noteParts.push(parking.trim());
      const payload = {
        user_id: u.user.id,
        make: selected.make,
        model: selected.model,
        category: selected.category,
        color: color.trim() || null,
        registration_number: reg.trim().toUpperCase(),
        parking_notes: noteParts.join(" • ") || null,
      };
      const { error } = await (supabase as any).from("customer_vehicles").insert(payload);
      if (error) {
        // Surface a friendly message for the most common failures.
        if (error.code === "23505")
          throw new Error("You've already added this registration number.");
        if (error.code === "42501" || error.message?.toLowerCase().includes("row-level security")) {
          throw new Error("Permission denied. Please sign out and sign in again.");
        }
        throw new Error(error.message || "Could not save vehicle");
      }
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

  const renderResults = (compact = false) => {
    if (catalogQ.isLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center">
          <Car className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No matches</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {query.trim() ? `Nothing called "${query.trim()}"` : "Nothing in this filter combo."}
            {brand ? ` under ${brand}` : ""}.
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      );
    }

    return (
      <div
        className={compact ? "rounded-3xl border border-border bg-card p-3 shadow-sm" : "space-y-4"}
      >
        <div className="mb-2 text-[11px] text-muted-foreground">
          {filtered.length} model{filtered.length === 1 ? "" : "s"} across {grouped.length} brand
          {grouped.length === 1 ? "" : "s"}
        </div>
        <div className="space-y-3">
          {grouped.map(([make, rows]) => (
            <div key={make}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {make}
              </div>
              <div className="space-y-1.5">
                {rows.map((c) => {
                  const body = vehicleBodyLabel(c.make, c.model, c.category);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 hover:bg-accent"
                    >
                      <VehicleAvatar
                        imageUrl={c.image_url}
                        make={c.make}
                        model={c.model}
                        className="h-12 w-14 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {highlight(`${c.make} ${c.model}`, query.trim())}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {c.model.toUpperCase()} — {body}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-primary">Select</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="px-5 pt-6 pb-32">
      <button
        onClick={() => navigate({ to: "/c/vehicles" })}
        className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Add a vehicle</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Filter by brand or search — we'll set the right pricing tier.
      </p>

      {userId === null && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            You appear to be signed out.{" "}
            <Link to="/c/auth" className="underline">
              Sign in
            </Link>{" "}
            to save your vehicle.
          </div>
        </div>
      )}

      {catalogQ.error && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Couldn't load the vehicle list.{" "}
            {String((catalogQ.error as any)?.message ?? "Check connection and retry.")}
          </div>
        </div>
      )}

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
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isSearching && <div className="mt-2">{renderResults(true)}</div>}

          {/* Active filter summary + one-tap clear */}
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {query.trim() && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium">
                  "{query.trim()}"
                  <button onClick={() => setQuery("")} className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {brand && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium">
                  {brand}
                  <button onClick={() => setBrand(null)} className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {cat !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium">
                  {CATEGORIES.find((c) => c.key === cat)?.label}
                  <button onClick={() => setCat("all")} className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={clearFilters}
                className="ml-auto rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-primary hover:bg-accent"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Category chips */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  cat === c.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Brand chips */}
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Brand
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setBrand(null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  brand === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                All brands
              </button>
              {brands.map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b === brand ? null : b)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    brand === b
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          {!isSearching && <div className="mt-4">{renderResults(false)}</div>}
        </>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-primary/30 bg-accent/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <VehicleAvatar
                imageUrl={selected.image_url}
                make={selected.make}
                model={selected.model}
                color={color}
                className="h-14 w-16 rounded-2xl"
              />
              <div>
                <div className="text-base font-semibold">
                  {selected.make} {selected.model}
                </div>
                <div className="text-xs text-muted-foreground">
                  Auto-classified: {selected.model.toUpperCase()} —{" "}
                  {vehicleBodyLabel(selected.make, selected.model, selected.category)}
                </div>
              </div>
              <Check className="h-5 w-5 text-primary" />
            </div>
            <button
              className="mt-2 text-xs text-muted-foreground underline"
              onClick={() => setSelected(null)}
            >
              Change car
            </button>
          </div>

          <div>
            <Label>Registration number</Label>
            <Input
              value={reg}
              onChange={(e) => setReg(e.target.value.toUpperCase())}
              placeholder="UP 32 AB 1234"
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Year (optional)</Label>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="2022"
                inputMode="numeric"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Colour (optional)</Label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="White"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Variant / trim (optional)</Label>
            <Input
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              placeholder="VXi, ZX+, Sportz, etc."
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Parking notes (optional)</Label>
            <Input
              value={parking}
              onChange={(e) => setParking(e.target.value)}
              placeholder="B-block basement, slot 14"
              className="mt-1.5"
            />
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => save.mutate()}
            disabled={save.isPending || !userId}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save vehicle
          </Button>
        </div>
      )}
    </div>
  );
}
