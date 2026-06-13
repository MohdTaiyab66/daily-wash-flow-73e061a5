import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Navigation, Play, AlertTriangle, Clock, Car, Loader2 } from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { requiredBefore } from "@/lib/format";
import { initiateMaskedCall } from "@/lib/calling.functions";
import { toast } from "sonner";
import { useState } from "react";
import { LiveMap } from "@/components/LiveMap";
import { EndOfDayCard } from "@/components/EndOfDayCard";

export const Route = createFileRoute("/_authenticated/app/live")({
  component: () => <OfflineGuard label="your live route"><RoutePage /></OfflineGuard>,
});

function RoutePage() {
  const { data: services } = useQuery({
    queryKey: ["route-today"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("services")
        .select("id,status,time_slot,sequence_no,customers(full_name,area,address_line,preferred_time,latitude,longitude),vehicles(make,model,registration_number,color)")
        .eq("scheduled_date", d)
        .order("sequence_no", { ascending: true });
      return data ?? [];
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const total = services?.length ?? 0;
  const done = (services ?? []).filter((s) => s.status === "completed").length;
  const remaining = total - done;
  const isEndOfDay = total > 0 && remaining === 0;

  const visible = (services ?? []).filter((s) => s.status !== "completed");

  // Active service hours: 5:00–13:00 local. Customer pins shown only when an
  // active assignment exists for today with remaining stops AND we're in window.
  const now = new Date();
  const hr = now.getHours();
  const inServiceHours = hr >= 5 && hr < 13;
  const hasActiveAssignment = visible.length > 0;
  const showCustomers = inServiceHours && hasActiveAssignment;

  const stops = visible
    .filter((s) => {
      const c = s.customers as any;
      return c?.latitude != null && c?.longitude != null;
    })
    .map((s) => {
      const c = s.customers as any;
      return {
        id: s.id,
        sequence_no: s.sequence_no,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        label: c.full_name ?? "Customer",
      };
    });

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Today's route</h1>
      <p className="mt-1 text-sm text-muted-foreground">Optimised by distance and preferred time.</p>

      <div className="mt-5">
        <LiveMap stops={stops} showCustomers={showCustomers} />
        <Card className="mt-3 grid grid-cols-3 border-t border-border text-center p-0">
          <KPI label="Assigned" value={String(total)} />
          <KPI label="Done" value={String(done)} />
          <KPI label="Left" value={String(remaining)} />
        </Card>
      </div>


      {isEndOfDay && <div className="mt-5"><EndOfDayCard /></div>}

      {/* Bottom panel — stop list */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Next stops</h2>
      <div className="mt-3 space-y-3 pb-6">
        {visible.length === 0 && !isEndOfDay && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No stops scheduled today.
          </Card>
        )}
        {visible.map((s) => {
          const c = s.customers as any;
          const v = s.vehicles as any;
          const navUrl = c?.latitude
            ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c?.address_line ?? ""} ${c?.area ?? ""} Lucknow`)}`;
          const priority = c?.preferred_time?.startsWith("07") || c?.preferred_time?.startsWith("06");
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${priority ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
                  {s.sequence_no}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{c?.full_name}</p>
                    {priority && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">Priority</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <Car className="mr-1 inline h-3 w-3" />{v?.make} {v?.model} · {v?.registration_number}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <MapPin className="mr-1 inline h-3 w-3" />{c?.area}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />Required before {requiredBefore(c?.preferred_time)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <Button asChild size="sm" variant="outline" className="col-span-1">
                  <a href={navUrl} target="_blank" rel="noreferrer" aria-label="Navigate"><Navigation className="h-4 w-4" /></a>
                </Button>
                <MaskedCallButton serviceId={s.id} compact />
                <Button asChild size="sm" className="col-span-2">
                  <Link to="/app/service/$id" params={{ id: s.id }}>
                    {s.status === "in_progress" ? <><AlertTriangle className="mr-1.5 h-4 w-4" />Continue</> : <><Play className="mr-1.5 h-4 w-4" />Start</>}
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function MaskedCallButton({ serviceId, compact, full }: { serviceId: string; compact?: boolean; full?: boolean }) {
  const call = useServerFn(initiateMaskedCall);
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    try {
      const r = await call({ data: { service_id: serviceId } });
      toast.success(r.message ?? "Connecting...");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not place call");
    } finally {
      setLoading(false);
    }
  };
  if (compact) {
    return (
      <Button size="sm" variant="outline" className="col-span-1" onClick={onClick} disabled={loading} aria-label="Call Customer">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
      </Button>
    );
  }
  return (
    <Button variant="outline" size={full ? "lg" : "sm"} className={full ? "w-full" : ""} onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Phone className="mr-1.5 h-4 w-4" />} Call Customer
    </Button>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
