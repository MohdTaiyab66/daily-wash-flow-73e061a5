import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, MapPin, Timer, IndianRupee, CheckCircle2, Calendar, Sun } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { useI18n } from "@/lib/i18n";
import { formatTime12 } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: () => <OfflineGuard label="assignment builder"><AssignmentsPage /></OfflineGuard>,
});

function AssignmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();

  const [cars, setCars] = useState(20);
  const [duration, setDuration] = useState(15);

  const { data: active, isLoading: loadingActive } = useQuery({
    queryKey: ["active-assignment-builder"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("assignments")
        .select("id")
        .eq("partner_id", u.user!.id)
        .eq("status", "active")
        .gte("end_date", today)
        .maybeSingle();
      return data;
    },
  });

  // Accepted assignments live on the My Assignment page — redirect.
  useEffect(() => {
    if (active?.id) navigate({ to: "/app/my-assignment", replace: true });
  }, [active?.id, navigate]);

  const { data: preview, isFetching } = useQuery({
    queryKey: ["preview", cars, duration],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_assignment", { p_cars: cars, p_duration: duration });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !active,
  });

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("accept_assignment_v2", { p_cars: cars, p_duration: duration });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Assignment accepted · route optimised");
      qc.invalidateQueries();
      navigate({ to: "/app/my-assignment" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not accept"),
  });

  if (loadingActive || active) {
    return <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">Loading…</div>;
  }


  const dailyEarn = preview ? Number(preview.daily_earnings) : cars * 17;
  const totalEarn = preview ? Number(preview.total_earnings) : 0;
  const availableCars = preview ? Number(preview.cars ?? 0) : 0;
  const workingDays = preview?.working_days ?? 0;
  const radius = preview ? Number(preview.estimated_radius_km) : 0;
  const hours = preview ? Number(preview.estimated_hours) : 0;
  const startTime = preview?.expected_start_time ?? "07:00";

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <h1 className="text-2xl font-semibold tracking-tight">{t("build_your_assignment")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("builder_sub")}</p>

      {/* Cars slider */}
      <Card className="mt-5 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("cars_per_day")}</p>
          <p className="text-3xl font-semibold tracking-tight">{cars}</p>
        </div>
        <Slider value={[cars]} min={15} max={30} step={1} onValueChange={(v) => setCars(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>15</span><span>30</span></div>
      </Card>

      {/* Duration slider */}
      <Card className="mt-3 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("duration")}</p>
          <p className="text-3xl font-semibold tracking-tight">{duration} <span className="text-base text-muted-foreground">{t("days")}</span></p>
        </div>
        <Slider value={[duration]} min={7} max={30} step={1} onValueChange={(v) => setDuration(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>7</span><span>30</span></div>
      </Card>

      {/* Live calculation */}
      <Card className="mt-4 border-0 bg-foreground p-5 text-background">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-background/60">{t("total_earnings")}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">₹{totalEarn.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-xs text-background/60">₹{dailyEarn}/{t("daily").toLowerCase()} · {workingDays} {t("days")}</p>
          </div>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-background/60" />}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-background/10 pt-4 text-xs">
          <Mini icon={<Timer className="h-3 w-3" />} label={t("time")} value={`${hours}h`} />
          <Mini icon={<MapPin className="h-3 w-3" />} label={t("radius")} value={`${radius} km`} />
          <Mini icon={<Sun className="h-3 w-3" />} label={t("starts")} value={formatTime12(startTime)} />
        </div>
      </Card>

      {/* Rules */}
      <Card className="mt-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("assignment_rules")}</p>
        <ul className="mt-3 space-y-2 text-xs">
          <Rule>Same customers for the full {duration} days · consistent quality</Rule>
          <Rule>Mondays are off — auto-excluded from working days</Rule>
          <Rule>Flat rate ₹17 per completed car · no tiered pricing</Rule>
          <Rule>Cancelling mid-assignment: ₹250 + that day's earnings deducted</Rule>
        </ul>
      </Card>

      <Card className="mt-3 flex items-start gap-3 border-dashed p-4 text-xs">
        <IndianRupee className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="font-semibold">First payout</p>
          <p className="mt-1 text-muted-foreground">First week's earnings are held as a security reserve and released after your first 15 active days.</p>
        </div>
      </Card>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-md p-4">
          <Button size="lg" className="w-full" disabled={accept.isPending || (preview && availableCars === 0)} onClick={() => accept.mutate()}>
            {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {availableCars === 0 && preview ? "No customers available" : `${t("accept")} · ${availableCars || cars} × ${duration} ${t("days")} · ₹${totalEarn.toLocaleString("en-IN")}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-background/60">{icon}<span>{label}</span></div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
