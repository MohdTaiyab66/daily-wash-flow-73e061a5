import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, Loader2, Sparkles, Droplets, Wrench } from "lucide-react";
import { toast } from "sonner";
import { saveCustomerPackage, type PackageAddon } from "@/lib/saved-packages.functions";

/**
 * Phase 5 — Package Builder
 *
 * Live-recompute base plan + monthly add-ons, save the combo as a named
 * template for reuse across vehicles.
 */

type AddonSpec = {
  addon_type: PackageAddon["addon_type"];
  label: string;
  hint: string;
  price: number;
  icon: typeof Sparkles;
};

const ADDONS: AddonSpec[] = [
  { addon_type: "extra_exterior", label: "Extra Exterior Wash", hint: "+1 exterior / month", price: 149, icon: Droplets },
  { addon_type: "extra_interior", label: "Extra Interior Wash", hint: "+1 interior / month", price: 199, icon: Wrench },
  { addon_type: "extra_both", label: "Extra Interior & Exterior", hint: "+1 of each / month", price: 299, icon: Sparkles },
];

const INR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function PackageBuilderSheet({
  open,
  onOpenChange,
  basePlanSlug,
  basePlanPrice,
  basePlanName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  basePlanSlug: string | null;
  basePlanPrice: number;
  basePlanName: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [qty, setQty] = useState<Record<PackageAddon["addon_type"], number>>({
    extra_exterior: 0,
    extra_interior: 0,
    extra_both: 0,
  });

  const saveFn = useServerFn(saveCustomerPackage);
  const saveM = useMutation({
    mutationFn: (payload: Parameters<typeof saveFn>[0]["data"]) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Package saved");
      qc.invalidateQueries({ queryKey: ["saved-packages"] });
      onOpenChange(false);
      setName("");
      setQty({ extra_exterior: 0, extra_interior: 0, extra_both: 0 });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save package"),
  });

  const addons = useMemo<PackageAddon[]>(
    () =>
      ADDONS.filter((a) => qty[a.addon_type] > 0).map((a) => ({
        addon_type: a.addon_type,
        quantity: qty[a.addon_type],
        monthly_price: a.price,
      })),
    [qty],
  );

  const addonTotal = addons.reduce((s, a) => s + a.monthly_price * a.quantity, 0);
  const total = basePlanPrice + addonTotal;

  const inc = (k: PackageAddon["addon_type"]) => setQty((q) => ({ ...q, [k]: Math.min(9, q[k] + 1) }));
  const dec = (k: PackageAddon["addon_type"]) => setQty((q) => ({ ...q, [k]: Math.max(0, q[k] - 1) }));

  const canSave = !!basePlanSlug && name.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl p-0">
        <div className="mx-auto max-w-md p-5">
          <SheetHeader className="text-left">
            <SheetTitle className="text-lg font-semibold tracking-tight">Build my plan</SheetTitle>
            <p className="text-xs text-muted-foreground">Bundle your plan with add-ons and save it for later.</p>
          </SheetHeader>

          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Base plan</p>
                <p className="text-sm font-semibold">{basePlanName}</p>
              </div>
              <p className="text-sm font-semibold">{INR(basePlanPrice)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly add-ons</p>
            {ADDONS.map((a) => {
              const Icon = a.icon;
              const n = qty[a.addon_type];
              return (
                <div key={a.addon_type} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.label}</p>
                    <p className="text-[11px] text-muted-foreground">{a.hint} · {INR(a.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => dec(a.addon_type)} disabled={n === 0} aria-label="Decrease">
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{n}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => inc(a.addon_type)} aria-label="Increase">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-xl font-bold tracking-tight">{INR(total)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ month</span></p>
            </div>
            {addonTotal > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {INR(basePlanPrice)} plan + {INR(addonTotal)} add-ons
              </p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="pkg-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Package name
            </Label>
            <Input
              id="pkg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Family Car, Office Car, Weekend…"
              maxLength={60}
            />
          </div>

          <Button
            className="mt-4 w-full rounded-xl"
            size="lg"
            disabled={!canSave || saveM.isPending}
            onClick={() => {
              if (!basePlanSlug) return;
              saveM.mutate({
                name: name.trim(),
                base_plan_slug: basePlanSlug,
                base_plan_price: basePlanPrice,
                addons,
              });
            }}
          >
            {saveM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save package
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Saved packages can be applied to other vehicles later.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
