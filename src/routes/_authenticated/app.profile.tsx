import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, BookOpen, Headphones, Share2, ChevronRight, CheckCircle2, AlertCircle,
  Award, Droplets, Sparkles, Disc, Users, ShieldCheck, PlayCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { data: partner } = useQuery({
    queryKey: ["me-partner-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("partners").select("*").eq("id", u.user!.id).maybeSingle();
      return data;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const verifications = [
    { label: "Aadhaar", ok: !!partner?.aadhaar_verified },
    { label: "PAN", ok: !!partner?.pan_verified },
    { label: "Bank account", ok: !!partner?.bank_verified },
  ];

  const sops = [
    { icon: <Droplets className="h-4 w-4" />, title: "Daily Shine SOP" },
    { icon: <Sparkles className="h-4 w-4" />, title: "Chemical usage" },
    { icon: <BookOpen className="h-4 w-4" />, title: "Microfiber usage" },
    { icon: <Disc className="h-4 w-4" />, title: "Tyre polish SOP" },
    { icon: <Users className="h-4 w-4" />, title: "Customer behaviour SOP" },
    { icon: <ShieldCheck className="h-4 w-4" />, title: "Vehicle safety SOP" },
    { icon: <PlayCircle className="h-4 w-4" />, title: "Video tutorials" },
  ];

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card className="mt-5 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground text-lg font-semibold">
            {partner?.full_name?.[0] ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{partner?.full_name ?? "Partner"}</p>
            <p className="text-xs text-muted-foreground">+91 {partner?.phone}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-primary">{partner?.partner_code}</span>
              <Badge className="border-0 bg-accent text-accent-foreground"><Award className="mr-1 h-3 w-3" />{partner?.level ?? "Bronze"}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 border-t border-border pt-4 text-center">
          <StatMini value={String(partner?.total_cars_completed ?? 0)} label="Cars" />
          <StatMini value={`${Number(partner?.attendance_pct ?? 100).toFixed(0)}%`} label="Attendance" />
          <StatMini value={`₹${Number(partner?.lifetime_earnings ?? 0)}`} label="Lifetime" />
        </div>
      </Card>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Verifications</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {verifications.map((v) => (
          <Card key={v.label} className={`p-3 ${v.ok ? "" : "border-dashed"}`}>
            <div className={`flex items-center gap-1.5 ${v.ok ? "text-[color:var(--success)]" : "text-muted-foreground"}`}>
              {v.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <span className="text-[11px] font-medium">{v.ok ? "Verified" : "Pending"}</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{v.label}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Training</h2>
      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Completion</p>
          <p className="text-sm font-semibold">{Number(partner?.training_completion_pct ?? 0).toFixed(0)}%</p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Number(partner?.training_completion_pct ?? 0)}%` }} />
        </div>
      </Card>
      <div className="mt-3 space-y-2">
        {sops.map((s) => (
          <Card key={s.title} className="flex items-center justify-between p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">{s.icon}</span>
              <span className="text-sm">{s.title}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        <Row icon={<Share2 className="h-4 w-4" />} label={`Refer & earn · ${partner?.referral_code ?? ""}`} />
        <Row icon={<Headphones className="h-4 w-4" />} label="Help & support" />
      </div>

      <Button variant="outline" className="mt-6 w-full" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

function StatMini({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Card>
  );
}
