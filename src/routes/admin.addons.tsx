import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/addons")({
  head: () => ({ meta: [{ title: "Add-ons · Admin" }] }),
  component: AddonsAdminPage,
});

type Addon = {
  id: string;
  name: string;
  description: string | null;
  price_hatchback: number;
  price_sedan_suv: number;
  applies_to_slugs: string[];
  active: boolean;
  sort_order: number;
};

type BaseService = { slug: string; name: string };

// Slugs a customer actually books as a "base service" (that can have add-ons).
const CUSTOMER_BASE_SLUGS = [
  "one-time-wash",
  "one-time-wash-no-polish",
  "deep-clean",
  "deep-clean-interior",
  "daily-shine",
];

function AddonsAdminPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Addon | null>(null);
  const [creating, setCreating] = useState(false);

  const addonsQ = useQuery({
    queryKey: ["admin-addons"],
    queryFn: async (): Promise<Addon[]> => {
      const { data, error } = await (supabase as any)
        .from("service_addons").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Addon[];
    },
  });

  const servicesQ = useQuery({
    queryKey: ["admin-addons-base-services"],
    queryFn: async (): Promise<BaseService[]> => {
      const { data } = await (supabase as any)
        .from("service_catalog")
        .select("slug,name")
        .in("slug", CUSTOMER_BASE_SLUGS)
        .order("sort_order");
      return (data ?? []) as BaseService[];
    },
  });

  const services = servicesQ.data ?? [];
  const nameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    services.forEach((s) => m.set(s.slug, s.name));
    return m;
  }, [services]);

  const toggleActive = useMutation({
    mutationFn: async (a: Addon) => {
      const { error } = await (supabase as any)
        .from("service_addons").update({ active: !a.active }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-addons"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("service_addons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Add-on deleted"); qc.invalidateQueries({ queryKey: ["admin-addons"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Add-ons
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Manage the add-ons that appear on the customer booking page. Pricing follows the vehicle
            category (Hatchback / Compact Sedan vs Sedan / SUV). Use the compatible services to hide
            add-ons that would duplicate what a base service already includes.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New add-on
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Hatchback</th>
                <th className="px-4 py-3">Sedan / SUV</th>
                <th className="px-4 py-3">Compatible</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {addonsQ.isLoading && (
                <tr><td colSpan={7} className="text-center py-8"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
              )}
              {!addonsQ.isLoading && (addonsQ.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No add-ons yet. Create one to get started.</td></tr>
              )}
              {(addonsQ.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    {a.description && <div className="text-[11px] text-muted-foreground">{a.description}</div>}
                  </td>
                  <td className="px-4 py-3">₹{Number(a.price_hatchback)}</td>
                  <td className="px-4 py-3">₹{Number(a.price_sedan_suv)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(a.applies_to_slugs?.length ? a.applies_to_slugs : ["(all)"]).map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px]">
                          {nameBySlug.get(s) ?? s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Switch checked={a.active} onCheckedChange={() => toggleActive.mutate(a)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-600"
                        onClick={() => { if (confirm(`Delete "${a.name}"?`)) del.mutate(a.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddonDialog
        open={creating || !!editing}
        addon={editing}
        services={services}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-addons"] }); setCreating(false); setEditing(null); }}
      />
    </div>
  );
}

function AddonDialog({
  open, addon, services, onClose, onSaved,
}: {
  open: boolean;
  addon: Addon | null;
  services: BaseService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!addon;
  const [name, setName] = useState(addon?.name ?? "");
  const [description, setDescription] = useState(addon?.description ?? "");
  const [priceHb, setPriceHb] = useState<string>(String(addon?.price_hatchback ?? ""));
  const [priceSuv, setPriceSuv] = useState<string>(String(addon?.price_sedan_suv ?? ""));
  const [slugs, setSlugs] = useState<string[]>(addon?.applies_to_slugs ?? []);
  const [sortOrder, setSortOrder] = useState<string>(String(addon?.sort_order ?? 100));
  const [active, setActive] = useState<boolean>(addon?.active ?? true);
  const [saving, setSaving] = useState(false);

  // Re-hydrate when opening a different row
  useMemo(() => {
    setName(addon?.name ?? "");
    setDescription(addon?.description ?? "");
    setPriceHb(String(addon?.price_hatchback ?? ""));
    setPriceSuv(String(addon?.price_sedan_suv ?? ""));
    setSlugs(addon?.applies_to_slugs ?? []);
    setSortOrder(String(addon?.sort_order ?? 100));
    setActive(addon?.active ?? true);
  }, [addon]);

  const toggleSlug = (slug: string) => {
    setSlugs((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const hb = Number(priceHb); const suv = Number(priceSuv);
    if (!Number.isFinite(hb) || hb < 0) { toast.error("Hatchback price must be ≥ 0"); return; }
    if (!Number.isFinite(suv) || suv < 0) { toast.error("Sedan/SUV price must be ≥ 0"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price_hatchback: hb,
        price_sedan_suv: suv,
        applies_to_slugs: slugs,
        sort_order: Number(sortOrder) || 100,
        active,
      };
      if (isEdit && addon) {
        const { error } = await (supabase as any).from("service_addons").update(payload).eq("id", addon.id);
        if (error) throw error;
        toast.success("Add-on updated");
      } else {
        const { error } = await (supabase as any).from("service_addons").insert(payload);
        if (error) throw error;
        toast.success("Add-on created");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Edit add-on" : "New add-on"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Body Polish" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea rows={2} value={description ?? ""} onChange={(e) => setDescription(e.target.value)}
              placeholder="Hand-applied wax polish for glossy finish" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price · Hatchback / Compact Sedan</Label>
              <Input inputMode="numeric" value={priceHb} onChange={(e) => setPriceHb(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
            <div>
              <Label>Price · Sedan / SUV</Label>
              <Input inputMode="numeric" value={priceSuv} onChange={(e) => setPriceSuv(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          </div>
          <div>
            <Label>Compatible base services</Label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Only shown for the selected services. Leave all unchecked to show on every base service.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 rounded-lg border border-border p-3">
              {services.map((s) => (
                <label key={s.slug} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={slugs.includes(s.slug)}
                    onChange={() => toggleSlug(s.slug)}
                  />
                  <span>{s.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{s.slug}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Display order</Label>
              <Input inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-sm">Active</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
