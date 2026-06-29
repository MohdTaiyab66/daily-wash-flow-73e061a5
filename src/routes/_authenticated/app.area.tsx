import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Lock, Crosshair, Loader2, CheckCircle2, ArrowLeft, Clock } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";

export const Route = createFileRoute("/_authenticated/app/area")({
  component: AreaPage,
});

import { SERVICE_AREAS as AREAS, nearestServiceArea as nearestArea } from "@/lib/areas";



function AreaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [outOfCoverage, setOutOfCoverage] = useState<{ area: string; lat: number; lng: number } | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ vehicle: "", experience: "", cars: "", notes: "" });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const reverse = useServerFn(reverseGeocode);

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

  const { data: existingRequest } = useQuery({
    queryKey: ["my-expansion-request"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("partner_expansion_requests")
        .select("id,area_name,status,created_at")
        .eq("partner_user_id", u.user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });


  const locked = !!partner?.area_locked_until && new Date(partner.area_locked_until) > new Date();
  const current = partner?.home_area;
  const pick = selected ?? current;

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setLocating(true);
    setOutOfCoverage(null);
    setShowRequestForm(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDetectedCoords({ lat, lng });
        let realArea = "";
        try {
          const r = await reverse({ data: { lat, lng } });
          realArea = (r.area || r.city || "").trim();
          setDetectedAddress(r.formatted_address);
        } catch {
          // proceed with coverage check even without geocoded name
        }
        // Authoritative serviceability check via coverage zones (GIS)
        const { data: cov } = await supabase.rpc("get_coverage_at", { p_lat: lat, p_lng: lng });
        const zones = Array.isArray(cov) ? cov : [];
        if (zones.length === 0) {
          setSelected(null);
          setOutOfCoverage({ area: realArea || "your location", lat, lng });
          toast.message("Not yet serviceable", { description: `${realArea || "Your location"} is outside our coverage zones.` });
          setLocating(false);
          return;
        }
        // Inside coverage — match catalog entry if available
        const exact = AREAS.find((a) => a.name.toLowerCase() === realArea.toLowerCase());
        if (exact) {
          setSelected(exact.name);
          toast.success(`Detected: ${exact.name}`);
        } else {
          const a = nearestArea(lat, lng);
          setSelected(a.name);
          toast.success(`Serviceable area: ${a.name}`);
        }
        setLocating(false);
      },
      () => { setLocating(false); toast.error("Could not detect location — pick manually"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const submitRequest = async () => {
    if (!outOfCoverage) return;
    setSubmittingRequest(true);
    const { error } = await supabase.rpc("submit_partner_expansion_request", {
      p_area_name: outOfCoverage.area,
      p_latitude: outOfCoverage.lat,
      p_longitude: outOfCoverage.lng,
      p_vehicle: requestForm.vehicle || undefined,
      p_experience_years: requestForm.experience ? Number(requestForm.experience) : undefined,
      p_preferred_cars_per_day: requestForm.cars ? Number(requestForm.cars) : undefined,
      p_expected_joining_date: undefined,
      p_notes: requestForm.notes || undefined,
    });

    setSubmittingRequest(false);
    if (error) { toast.error(error.message); return; }
    setRequestSubmitted(true);
    setShowRequestForm(false);
    qc.invalidateQueries({ queryKey: ["my-expansion-request"] });
    toast.success("Request submitted — we'll notify you when your area opens up");
  };



  const save = async () => {
    if (!pick) return;
    if (locked && pick !== current) {
      toast.error(`Area locked until ${new Date(partner!.area_locked_until!).toLocaleDateString("en-IN")}`);
      return;
    }
    const area = AREAS.find((a) => a.name === pick)!;
    const coords = selected === pick && detectedCoords ? detectedCoords : { lat: area.lat, lng: area.lng };
    setSaving(true);
    const { error } = await supabase.rpc("set_partner_area", { p_area: area.name, p_lat: coords.lat, p_lng: coords.lng });
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

      {detectedAddress && (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Detected: </span>{detectedAddress}
          {detectedCoords && (
            <span className="ml-1 opacity-70">
              ({detectedCoords.lat.toFixed(5)}, {detectedCoords.lng.toFixed(5)})
            </span>
          )}
        </p>
      )}


      <Button variant="outline" className="mt-4 w-full" onClick={useCurrentLocation} disabled={locating}>
        {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
        Use my current location
      </Button>

      {(existingRequest || requestSubmitted) && !outOfCoverage && (
        <Card className="mt-4 border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30" data-testid="expansion-pending">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 text-amber-600" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">Expansion request pending</p>
              <p className="mt-1 text-xs text-muted-foreground">
                We've recorded your interest in {existingRequest?.area_name || outOfCoverage}. We'll notify you when it opens.
              </p>
            </div>
          </div>
        </Card>
      )}

      {outOfCoverage && (
        <Card className="mt-4 border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30" data-testid="coming-soon-panel">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-semibold">Coming soon to {outOfCoverage.area}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your location isn't in our active coverage yet. Register your interest — we expand to areas with the most partner demand first.
              </p>
              {!showRequestForm ? (
                <Button size="sm" className="mt-3" onClick={() => setShowRequestForm(true)} data-testid="open-expansion-form">
                  Request my area
                </Button>
              ) : (
                <div className="mt-3 space-y-3">
                  <div>
                    <Label htmlFor="exp-vehicle" className="text-xs">Your vehicle</Label>
                    <Input id="exp-vehicle" placeholder="e.g. Bike / Scooter"
                      value={requestForm.vehicle}
                      onChange={(e) => setRequestForm((f) => ({ ...f, vehicle: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="exp-exp" className="text-xs">Experience (yrs)</Label>
                      <Input id="exp-exp" type="number" inputMode="numeric" min={0}
                        value={requestForm.experience}
                        onChange={(e) => setRequestForm((f) => ({ ...f, experience: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="exp-cars" className="text-xs">Cars/day target</Label>
                      <Input id="exp-cars" type="number" inputMode="numeric" min={1} max={40}
                        value={requestForm.cars}
                        onChange={(e) => setRequestForm((f) => ({ ...f, cars: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="exp-notes" className="text-xs">Anything else (optional)</Label>
                    <Textarea id="exp-notes" rows={2}
                      value={requestForm.notes}
                      onChange={(e) => setRequestForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submitRequest} disabled={submittingRequest} data-testid="submit-expansion">
                      {submittingRequest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit request
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRequestForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}


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
