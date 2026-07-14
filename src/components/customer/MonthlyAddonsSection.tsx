import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Droplets, Wrench, Sparkles, Loader2, Trash2, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Phase 4 — Add-ons split
 *
 *   Monthly Add-ons   → recurring, attached to the subscription until removed
 *   One-time Add-ons  → this month only, routed to the existing service page
 *
 * Monthly add-on intent is stored in `subscription_monthly_addons`.
 * A follow-up cron will materialise active rows into `subscription_entitlements`
 * on renewal — for now selection is captured and shown to the customer.
 */

type MonthlyRow = {
  id: string;
  addon_type: "extra_exterior" | "extra_interior" | "extra_both";
  quantity: number;
  monthly_price: number;
  is_active: boolean;
  added_at: string;
};

const MONTHLY_OPTIONS: {
  addon_type: MonthlyRow["addon_type"];
  label: string;
  hint: string;
  price: number;
  icon: typeof Sparkles;
}[] = [
  {
    addon_type: "extra_exterior",
    label: "Extra Exterior Wash",
    hint: "+1 exterior wash every month",
    price: 149,
    icon: Droplets,
  },
  {
    addon_type: "extra_interior",
    label: "Extra Interior Wash",
    hint: "+1 interior wash every month",
    price: 199,
    icon: Wrench,
  },
  {
    addon_type: "extra_both",
    label: "Extra Interior & Exterior",
    hint: "+1 of each every month",
    price: 299,
    icon: Sparkles,
  },
];

const ONE_TIME_OPTIONS: {
  slug: string;
  label: string;
  hint: string;
  icon: typeof Sparkles;
}[] = [
  { slug: "body-polish", label: "Body Polish", hint: "This month only", icon: Sparkles },
  { slug: "roof-cleaning", label: "Roof Cleaning", hint: "This month only", icon: Droplets },
  { slug: "seat-cleaning", label: "Seat Shampoo", hint: "This month only", icon: Wrench },
];

export function MonthlyAddonsSection({
  subscriptionId,
  userId,
}: {
  subscriptionId: string | null;
  userId: string | null;
}) {
  const qc = useQueryClient();

  const activeQ = useQuery({
    queryKey: ["monthly-addons", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async (): Promise<MonthlyRow[]> => {
      const { data, error } = await (supabase as any)
        .from("subscription_monthly_addons")
        .select("id, addon_type, quantity, monthly_price, is_active, added_at")
        .eq("subscription_id", subscriptionId)
        .eq("is_active", true)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthlyRow[];
    },
  });

  const active = activeQ.data ?? [];
  const activeTypes = new Set(active.map((a) => a.addon_type));

  const addMut = useMutation({
    mutationFn: async (opt: (typeof MONTHLY_OPTIONS)[number]) => {
      if (!subscriptionId || !userId) throw new Error("No active plan");
      const { error } = await (supabase as any)
        .from("subscription_monthly_addons")
        .insert({
          subscription_id: subscriptionId,
          user_id: userId,
          addon_type: opt.addon_type,
          quantity: 1,
          monthly_price: opt.price,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly-addons", subscriptionId] });
      toast.success("Add-on scheduled — applies from your next billing cycle.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add. Try again."),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("subscription_monthly_addons")
        .update({ is_active: false, removed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly-addons", subscriptionId] });
      toast.success("Removed — will not renew next cycle.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove."),
  });

  if (!subscriptionId) return null;

  return (
    <div className="mt-5 space-y-4">
      {/* Monthly Add-ons */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">Monthly add-ons</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Added every month until you remove them.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {MONTHLY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = activeTypes.has(opt.addon_type);
            const row = active.find((a) => a.addon_type === opt.addon_type);
            return (
              <div
                key={opt.addon_type}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${
                  isActive ? "border-primary/50 bg-primary/5" : "border-border"
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  ₹{opt.price}
                  <span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                </span>
                {isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => row && removeMut.mutate(row.id)}
                    disabled={removeMut.isPending}
                    aria-label={`Remove ${opt.label}`}
                  >
                    {removeMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-full text-xs"
                    onClick={() => addMut.mutate(opt)}
                    disabled={addMut.isPending}
                  >
                    {addMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {active.length > 0 && (
          <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            These apply from your next billing cycle. Total add-on cost: ₹
            {active.reduce((sum, r) => sum + r.monthly_price * r.quantity, 0)}/mo
          </p>
        )}
      </div>

      {/* One-time Add-ons */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">One-time add-ons</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              This month only — one-off services.
            </p>
          </div>
          <ShoppingBag className="h-5 w-5 shrink-0 text-primary" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {ONE_TIME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Link
                key={opt.slug}
                to="/c/service/$slug"
                params={{ slug: opt.slug }}
                className="flex flex-col items-start rounded-2xl border border-border bg-background p-3 transition-colors hover:border-primary/40"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="mt-2 text-[12px] font-semibold">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
