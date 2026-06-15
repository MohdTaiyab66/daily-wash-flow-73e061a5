import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Lock, Crosshair, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/area")({
  component: AreaPage,
});

import { SERVICE_AREAS as AREAS, nearestServiceArea as nearestArea } from "@/lib/areas";


function AreaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const { data: partner } = useQuery({
    queryKey: ["me-partner-area"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("partners")
        .select("home_area,previous_area,area_locked_until,area_change_count")
        .eq("id", u.user!.id).maybeSingle();
      return data;
    },
  });

  const locked = !!partner?.area_locked_until && new Date(partner.area_locked_until) > new Date();
  const current = partner?.home_area;
  const pick = selected ?? current;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const a = nearestArea(pos.coords.latitude, pos.coords.longitude);
        setSelected(a.name);
        setLocating(false);
        toast.success(`Detected: ${a.name}`);
      },
      () => { setLocating(false); toast.error("Could not detect location — pick manually"); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const save = async () => {
    if (!pick) return;
    if (locked && pick !== current) {
      toast.error(`Area locked until ${new Date(partner!.area_locked_until!).toLocaleDateString("en-IN")}`);
      return;
    }
    const area = AREAS.find((a) => a.name === pick)!;
    setSaving(true);
    const { error } = await supabase.rpc("set_partner_area", { p_area: area.name, p_lat: area.lat, p_lng: area.lng });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Work area saved");
    qc.invalidateQueries();
    navigate({ to: "/app" });
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <button onClick={() => navigate({ to: "/app/profile" })} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">Work area</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose where you'll service customers. You can change it once every 2 days.</p>

      {current && (
        <Card className="mt-4 flex items-start gap-3 p-4">
          <MapPin className="mt-0.5 h-4 w-4 text-primary" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Current area</p>
            <p className="font-semibold">{current}</p>
            {locked && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> Locked until {new Date(partner!.area_locked_until!).toLocaleDateString("en-IN")}
              </p>
            )}
          </div>
        </Card>
      )}

      <Button variant="outline" className="mt-4 w-full" onClick={useCurrentLocation} disabled={locating}>
        {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
        Use my current location
      </Button>

      <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or pick manually</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {AREAS.map((a) => {
          const active = pick === a.name;
          return (
            <button
              key={a.name}
              onClick={() => setSelected(a.name)}
              className={`flex items-center justify-between rounded-xl border p-3 text-left text-sm ${active ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="truncate">{a.name}</span>
              {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-md p-4">
          <Button size="lg" className="w-full" onClick={save} disabled={!pick || saving || (locked && pick !== current)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {locked && pick !== current ? <><Lock className="mr-2 h-4 w-4" />Locked · changes available {new Date(partner!.area_locked_until!).toLocaleDateString("en-IN")}</> : `Save ${pick ?? "area"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
