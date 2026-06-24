import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, BookOpen, Headphones, Share2, ChevronRight, CheckCircle2, AlertCircle,
  Award, History, FileText, Shield, MapPin, Lock, Languages,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { CapacitySettingsCard } from "@/components/partner/CapacitySettingsCard";
import { ReliabilityCard } from "@/components/partner/ReliabilityCard";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
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
    { label: t("verifications") === "Verifications" ? "Bank account" : "बैंक खाता", ok: !!partner?.bank_verified },
  ];

  const menu: Array<{ icon: React.ReactNode; title: string; to?: any }> = [
    { icon: <MapPin className="h-4 w-4" />, title: partner?.home_area ? `${t("work_area")} · ${partner.home_area}` : t("choose_work_area"), to: "/app/area" },
    { icon: <BookOpen className="h-4 w-4" />, title: t("training_center"), to: "/app/training" },
    { icon: <History className="h-4 w-4" />, title: t("activity_history"), to: "/app/history" },
    { icon: <Share2 className="h-4 w-4" />, title: `${t("refer_earn")} · ${partner?.referral_code ?? ""}` },
    { icon: <Headphones className="h-4 w-4" />, title: t("help_support") },
    { icon: <FileText className="h-4 w-4" />, title: t("policies") },
    { icon: <Shield className="h-4 w-4" />, title: t("sop_library"), to: "/app/training" },
  ];

  const areaLocked = !!partner?.area_locked_until && new Date(partner.area_locked_until) > new Date();

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("profile")}</h1>

      <Card className="mt-5 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground text-lg font-semibold">
            {partner?.full_name?.[0] ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{partner?.full_name ?? t("partner")}</p>
            <p className="text-xs text-muted-foreground">+91 {partner?.phone}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-primary">{partner?.partner_code}</span>
              <Badge className="border-0 bg-accent text-accent-foreground"><Award className="mr-1 h-3 w-3" />{partner?.level ?? "Bronze"}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 border-t border-border pt-4 text-center">
          <StatMini value={String(partner?.total_cars_completed ?? 0)} label={t("cars")} />
          <StatMini value={`${Number(partner?.attendance_pct ?? 100).toFixed(0)}%`} label={t("attendance")} />
          <StatMini value={`₹${Number(partner?.lifetime_earnings ?? 0)}`} label={t("lifetime")} />
        </div>
      </Card>

      {!partner?.home_area && (
        <Link to="/app/area">
          <Card className="mt-4 flex items-center justify-between border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{t("choose_work_area")}</p>
                <p className="text-[11px] text-muted-foreground">Required before you can accept assignments</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </Card>
        </Link>
      )}
      {partner?.home_area && areaLocked && (
        <Card className="mt-4 flex items-center gap-3 border-dashed p-3 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span>{t("area_locked_until")} {new Date(partner.area_locked_until!).toLocaleDateString("en-IN")}</span>
        </Card>
      )}

      {partner?.id && (
        <ReliabilityCard partnerId={partner.id} score={Number((partner as any)?.reliability_score ?? 100)} />
      )}

      <CapacitySettingsCard partnerId={partner?.id ?? null} />

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("verifications")}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {verifications.map((v) => (
          <Card key={v.label} className={`p-3 ${v.ok ? "" : "border-dashed"}`}>
            <div className={`flex items-center gap-1.5 ${v.ok ? "text-[color:var(--success)]" : "text-muted-foreground"}`}>
              {v.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <span className="text-[11px] font-medium">{v.ok ? t("verified") : t("pending")}</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{v.label}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("more")}</h2>
      <div className="mt-3 space-y-2">
        {menu.map((m) => {
          const inner = (
            <Card className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">{m.icon}</span>
                <span className="text-sm">{m.title}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          );
          return m.to ? <Link key={m.title} to={m.to}>{inner}</Link> : <div key={m.title}>{inner}</div>;
        })}
      </div>

      <p className="mt-6 text-center text-[10px] text-muted-foreground">{t("member_since")} {partner?.joined_on ? new Date(partner.joined_on).toLocaleDateString("en-IN") : "—"}</p>

      <Button variant="outline" className="mt-3 w-full" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> {t("sign_out")}
      </Button>
      <div className="h-6" />
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
