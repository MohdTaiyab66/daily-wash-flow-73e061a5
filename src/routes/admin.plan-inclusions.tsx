import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listSubscriptionPlansAdmin,
  listPlanInclusionsAdmin,
  adminUpsertPlanInclusion,
  adminDeletePlanInclusion,
  adminReorderPlanInclusions,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PlanInclusionsCard, inclusionIcon } from "@/components/customer/PlanInclusionsCard";

export const Route = createFileRoute("/admin/plan-inclusions")({
  component: PlanInclusionsAdminPage,
});

const ICON_CHOICES = [
  "droplets", "wrench", "sparkles", "spray-can", "shield", "car", "calendar", "check",
];

type Row = {
  id: string;
  plan_slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
};

function PlanInclusionsAdminPage() {
  const qc = useQueryClient();
  const listPlansFn = useServerFn(listSubscriptionPlansAdmin);
  const listIncFn = useServerFn(listPlanInclusionsAdmin);
  const upsertFn = useServerFn(adminUpsertPlanInclusion);
  const deleteFn = useServerFn(adminDeletePlanInclusion);
  const reorderFn = useServerFn(adminReorderPlanInclusions);

  const plansQ = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: () => listPlansFn(),
  });

  const plans = (plansQ.data ?? []) as Array<{ id: string; slug: string; name: string }>;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const activeSlug = selectedSlug ?? plans[0]?.slug ?? null;

  const incQ = useQuery({
    queryKey: ["admin-plan-inclusions", activeSlug],
    enabled: !!activeSlug,
    queryFn: () => listIncFn({ data: { plan_slug: activeSlug! } }) as Promise<Row[]>,
  });

  const rows = (incQ.data ?? []) as Row[];

  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);

  const upsertMut = useMutation({
    mutationFn: (input: {
      id?: string | null; plan_slug: string; title: string;
      description?: string | null; icon?: string | null;
      display_order?: number; is_active?: boolean;
    }) => upsertFn({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null); setCreating(false);
      qc.invalidateQueries({ queryKey: ["admin-plan-inclusions", activeSlug] });
      qc.invalidateQueries({ queryKey: ["plan-inclusions", activeSlug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-plan-inclusions", activeSlug] });
      qc.invalidateQueries({ queryKey: ["plan-inclusions", activeSlug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const reorderMut = useMutation({
    mutationFn: (ordered_ids: string[]) => reorderFn({ data: { ordered_ids } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plan-inclusions", activeSlug] });
      qc.invalidateQueries({ queryKey: ["plan-inclusions", activeSlug] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reorder failed"),
  });

  const moveRow = (idx: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    reorderMut.mutate(next.map((r) => r.id));
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Subscription Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage what each plan includes. Changes appear instantly in the customer app.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!activeSlug}>
          <Plus className="mr-1.5 h-4 w-4" /> Add inclusion
        </Button>
      </div>

      <div className="mt-6 grid gap-2 sm:max-w-sm">
        <Label className="text-xs">Plan</Label>
        <Select value={activeSlug ?? ""} onValueChange={(v) => setSelectedSlug(v)}>
          <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.slug}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Inclusions</h2>
          {incQ.isLoading ? (
            <div className="mt-4 h-24 animate-pulse rounded-md bg-muted" />
          ) : rows.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No inclusions yet for this plan.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((r, idx) => {
                const Icon = inclusionIcon(r.icon);
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <Icon className="h-4 w-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      {r.description && <p className="truncate text-[11px] text-muted-foreground">{r.description}</p>}
                      {!r.is_active && <p className="text-[10px] uppercase text-amber-600">Disabled</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => upsertMut.mutate({ id: r.id, plan_slug: r.plan_slug, title: r.title, description: r.description, icon: r.icon, display_order: r.display_order, is_active: v })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => moveRow(idx, -1)} disabled={idx === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => moveRow(idx, 1)} disabled={idx === rows.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { if (confirm(`Delete "${r.title}"?`)) deleteMut.mutate(r.id); }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Customer preview</h2>
          <div className="mt-2 rounded-2xl border border-dashed border-border bg-muted/20 p-3">
            <PlanInclusionsCard planSlug={activeSlug} />
          </div>
        </Card>
      </div>

      <InclusionDialog
        open={creating || !!editing}
        planSlug={activeSlug}
        row={editing}
        maxOrder={rows.length}
        saving={upsertMut.isPending}
        onCancel={() => { setEditing(null); setCreating(false); }}
        onSave={(payload) => upsertMut.mutate(payload)}
      />
    </div>
  );
}

function InclusionDialog({
  open, planSlug, row, maxOrder, saving, onCancel, onSave,
}: {
  open: boolean;
  planSlug: string | null;
  row: Row | null;
  maxOrder: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (p: { id?: string; plan_slug: string; title: string; description?: string | null; icon?: string | null; display_order?: number; is_active?: boolean }) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState<string>("check");
  const [active, setActive] = useState(true);

  useMemo(() => {
    if (open) {
      setTitle(row?.title ?? "");
      setDesc(row?.description ?? "");
      setIcon(row?.icon ?? "check");
      setActive(row?.is_active ?? true);
    }
  }, [open, row]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Edit inclusion" : "Add inclusion"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="26 Days Daily Exterior Chemical Cleaning" />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Icon</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ICON_CHOICES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-xs">Active</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={() => {
              if (!planSlug || !title.trim()) { toast.error("Title is required"); return; }
              onSave({
                id: row?.id,
                plan_slug: planSlug,
                title: title.trim(),
                description: desc.trim() || null,
                icon,
                is_active: active,
                display_order: row?.display_order ?? (maxOrder + 1) * 10,
              });
            }}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
