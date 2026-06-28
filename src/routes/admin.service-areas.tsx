import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/service-areas")({
  ssr: false,
  head: () => ({ meta: [{ title: "Service Areas — Admin" }] }),
  component: ServiceAreasAdmin,
});

type Area = {
  id: string;
  name: string; city: string; state: string;
  pincodes: string[]; center_lat: number | null; center_lng: number | null; radius_km: number;
  is_active: boolean; daily_shine_enabled: boolean; premium_enabled: boolean;
  washing_enabled: boolean; interior_enabled: boolean; exterior_enabled: boolean;
  deep_clean_enabled: boolean; polish_enabled: boolean; cutter_polish_enabled: boolean;
  seat_cleaning_enabled: boolean; roof_cleaning_enabled: boolean;
  launch_date: string | null; notes: string | null;
};

const SERVICE_FLAGS: Array<{ key: keyof Area; label: string }> = [
  { key: "washing_enabled", label: "Washing" },
  { key: "interior_enabled", label: "Interior" },
  { key: "exterior_enabled", label: "Exterior" },
  { key: "deep_clean_enabled", label: "Deep Clean" },
  { key: "polish_enabled", label: "Polish" },
  { key: "cutter_polish_enabled", label: "Cutter & Polish" },
  { key: "seat_cleaning_enabled", label: "Seat Cleaning" },
  { key: "roof_cleaning_enabled", label: "Roof Cleaning" },
];

function ServiceAreasAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Area | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ["admin-service-areas"],
    queryFn: async (): Promise<Area[]> => {
      const { data, error } = await (supabase as any).from("service_areas").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = async (id: string, field: keyof Area, value: boolean) => {
    const { error } = await (supabase as any).from("service_areas").update({ [field]: value }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-service-areas"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Service Areas</h1>
          <p className="text-sm text-muted-foreground">Manage Daily Shine & Premium availability per area. Changes apply instantly across the app.</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Add area</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Daily Shine</th>
                  <th className="px-4 py-3">Premium</th>
                  <th className="px-4 py-3">Pincodes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />{a.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{a.city}, {a.state}</div>
                    </td>
                    <td className="px-4 py-3"><Switch checked={a.is_active} onCheckedChange={(v) => toggle(a.id, "is_active", v)} /></td>
                    <td className="px-4 py-3"><Switch checked={a.daily_shine_enabled} onCheckedChange={(v) => toggle(a.id, "daily_shine_enabled", v)} /></td>
                    <td className="px-4 py-3"><Switch checked={a.premium_enabled} onCheckedChange={(v) => toggle(a.id, "premium_enabled", v)} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.pincodes?.length ? a.pincodes.join(", ") : "—"}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(editing || adding) && (
        <AreaEditDialog
          area={editing}
          onClose={() => { setEditing(null); setAdding(false); }}
          onSaved={() => { setEditing(null); setAdding(false); qc.invalidateQueries({ queryKey: ["admin-service-areas"] }); }}
        />
      )}
    </div>
  );
}

function AreaEditDialog({ area, onClose, onSaved }: { area: Area | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Area>>(area ?? {
    name: "", city: "Lucknow", state: "Uttar Pradesh", pincodes: [],
    radius_km: 2.5, is_active: true, daily_shine_enabled: false, premium_enabled: false,
    washing_enabled: true, interior_enabled: true, exterior_enabled: true,
    deep_clean_enabled: true, polish_enabled: true, cutter_polish_enabled: true,
    seat_cleaning_enabled: true, roof_cleaning_enabled: true,
  });
  const [pincodesText, setPincodesText] = useState((area?.pincodes ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload = {
      ...form,
      pincodes: pincodesText.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const { error } = area
      ? await (supabase as any).from("service_areas").update(payload).eq("id", area.id)
      : await (supabase as any).from("service_areas").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(area ? "Area updated" : "Area created");
    onSaved();
  };

  const set = <K extends keyof Area>(k: K, v: Area[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{area ? `Edit ${area.name}` : "New area"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
            <div><Label>City</Label><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} /></div>
            <div><Label>State</Label><Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} /></div>
            <div><Label>Radius (km)</Label><Input type="number" step="0.5" value={form.radius_km ?? 2.5} onChange={(e) => set("radius_km", Number(e.target.value))} /></div>
            <div><Label>Center lat</Label><Input type="number" step="0.0001" value={form.center_lat ?? ""} onChange={(e) => set("center_lat", Number(e.target.value))} /></div>
            <div><Label>Center lng</Label><Input type="number" step="0.0001" value={form.center_lng ?? ""} onChange={(e) => set("center_lng", Number(e.target.value))} /></div>
          </div>
          <div><Label>Pincodes (comma separated)</Label><Input value={pincodesText} onChange={(e) => setPincodesText(e.target.value)} placeholder="226016, 226020" /></div>
          <div><Label>Launch date</Label><Input type="date" value={form.launch_date ?? ""} onChange={(e) => set("launch_date", e.target.value as any)} /></div>
          <div><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Availability</h3>
            <div className="grid grid-cols-3 gap-3">
              <Flag label="Active" v={!!form.is_active} on={(v) => set("is_active", v)} />
              <Flag label="Daily Shine" v={!!form.daily_shine_enabled} on={(v) => set("daily_shine_enabled", v)} />
              <Flag label="Premium" v={!!form.premium_enabled} on={(v) => set("premium_enabled", v)} />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Premium service breakdown</h3>
            <div className="grid grid-cols-2 gap-3">
              {SERVICE_FLAGS.map((f) => (
                <Flag key={f.key} label={f.label} v={!!form[f.key]} on={(v) => set(f.key, v as any)} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Flag({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}
