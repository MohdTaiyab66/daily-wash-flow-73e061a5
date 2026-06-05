import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Car, CheckCircle2, Clock, MapPin, Star, Timer, Award, Briefcase } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/")({
  component: HomePage,
});

const RATE = 17;

function HomePage() {
  const { data: partner, refetch } = useQuery({
    queryKey: ["me-partner"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("partners").select("*").eq("id", u.user!.id).maybeSingle();
      return data;
    },
  });

  const { data: today } = useQuery({
    queryKey: ["today-services"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("services")
        .select("id,status,time_slot,sequence_no,started_at,completed_at,rate_per_car,customers(full_name,area,address_line,phone,preferred_time,latitude,longitude),vehicles(make,model,registration_number,color)")
        .eq("scheduled_date", d)
        .order("sequence_no", { ascending: true });
      return data ?? [];
    },
  });

  const { data: assignment } = useQuery({
    queryKey: ["today-assignment"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("assignments")
        .select("*")
        .eq("scheduled_date", d)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
  });

  const completed = (today ?? []).filter((s) => s.status === "completed").length;
  const total = today?.length ?? 0;
  const remaining = total - completed;
  const earnings = completed * RATE;

  // Working hours: difference between earliest started_at and latest completed_at among today's services
  const started = (today ?? []).map((s) => s.started_at).filter(Boolean).sort();
  const ended = (today ?? []).map((s) => s.completed_at).filter(Boolean).sort();
  const hours = started.length && ended.length
    ? ((new Date(ended[ended.length - 1]!).getTime() - new Date(started[0]!).getTime()) / 3.6e6).toFixed(1)
    : "0.0";

  const toggleAvailable = async (on: boolean) => {
    if (!partner) return;
    await supabase.from("partners").update({ availability: on ? "online" : "offline" }).eq("id", partner.id);
    toast.success(on ? "You are Online" : "You are Offline");
    refetch();
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Good morning</p>
          <h1 className="text-xl font-semibold tracking-tight">{partner?.full_name ?? "Partner"}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{partner?.partner_code}</span>
            <Badge className="border-0 bg-accent text-accent-foreground capitalize">
              <Award className="mr-1 h-3 w-3" /> {partner?.level ?? "Bronze"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
          <span className={`h-2 w-2 rounded-full ${partner?.availability === "online" ? "bg-[color:var(--success)]" : "bg-muted-foreground"}`} />
          <span className="text-xs font-medium">{partner?.availability === "online" ? "Online" : "Offline"}</span>
          <Switch checked={partner?.availability === "online"} onCheckedChange={toggleAvailable} />
        </div>
      </header>

      <Card className="mt-5 border-0 bg-foreground p-5 text-background">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-background/60">Today's earnings</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">₹{earnings}</p>
            <p className="mt-1 text-[11px] text-background/50">₹{RATE} × {completed} cars</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-background/60">Progress</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              {completed}<span className="text-base text-background/50">/{total}</span>
            </p>
          </div>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-background/15">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={<Car className="h-4 w-4" />} label="Remaining" value={String(remaining)} />
        <Stat icon={<MapPin className="h-4 w-4" />} label="Distance" value={`${assignment?.estimated_distance_km ?? 0} km`} />
        <Stat icon={<Timer className="h-4 w-4" />} label="Hours" value={`${hours}h`} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat icon={<Star className="h-4 w-4" />} label="Rating" value={Number(partner?.rating ?? 5).toFixed(2)} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Lifetime cars" value={String(partner?.total_cars_completed ?? 0)} />
      </div>

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Today's route</h2>
        <Link to="/app/assignments" className="text-xs font-medium text-primary">Choose assignment</Link>
      </div>

      <div className="mt-3 space-y-3">
        {(!today || today.length === 0) && (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <Briefcase className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-medium">No assignment yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Pick a 15, 20 or 25-car bundle near you.</p>
            </div>
            <Button asChild><Link to="/app/assignments">Choose assignment</Link></Button>
          </Card>
        )}

        {today?.map((s) => {
          const c = s.customers as any;
          const v = s.vehicles as any;
          return (
            <Link key={s.id} to="/app/service/$id" params={{ id: s.id }} className="block">
              <Card className="flex items-center gap-4 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">
                  {s.sequence_no}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{c?.full_name}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {v?.make} {v?.model} · {v?.registration_number}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {s.time_slot} · {c?.area}
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
    in_progress: { label: "In progress", cls: "bg-[color:var(--warning)]/20 text-foreground" },
    completed: { label: "Done", cls: "bg-[color:var(--success)]/15 text-[color:var(--success)]" },
    unavailable: { label: "Unavailable", cls: "bg-destructive/15 text-destructive" },
    skipped: { label: "Skipped", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[status] ?? map.pending;
  return <Badge className={`border-0 ${v.cls}`}>{v.label}</Badge>;
}
