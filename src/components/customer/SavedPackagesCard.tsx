import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Package, Trash2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  listSavedPackages,
  deleteSavedPackage,
  type SavedPackage,
} from "@/lib/saved-packages.functions";

const INR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const ADDON_LABEL: Record<string, string> = {
  extra_exterior: "Extra Exterior",
  extra_interior: "Extra Interior",
  extra_both: "Extra Both",
};

export function SavedPackagesCard({
  onBuild,
}: {
  onBuild: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSavedPackages);
  const q = useQuery({
    queryKey: ["saved-packages"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const delFn = useServerFn(deleteSavedPackage);
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Package removed");
      qc.invalidateQueries({ queryKey: ["saved-packages"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const rows = (q.data ?? []) as SavedPackage[];

  return (
    <div className="mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">My packages</h3>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" onClick={onBuild}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Build
        </Button>
      </div>

      {q.isLoading ? (
        <div className="mt-3 flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Save a package to quickly apply the same plan + add-ons to another vehicle.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((p) => {
            const addons = Array.isArray(p.addons) ? p.addons : [];
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">{INR(p.total_monthly)}</p>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {addons.length === 0
                      ? "Base plan only"
                      : addons
                          .map((a: any) => `${a.quantity}× ${ADDON_LABEL[a.addon_type] ?? a.addon_type}`)
                          .join(" · ")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={delM.isPending}
                  onClick={() => delM.mutate(p.id)}
                  aria-label="Remove package"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
