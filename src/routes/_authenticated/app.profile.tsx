import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, BookOpen, Headphones, Share2, ChevronRight,
  Award, History, FileText, Shield, MapPin, Lock, Languages, BellRing,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { CapacitySettingsCard } from "@/components/partner/CapacitySettingsCard";
import { ReliabilityCard } from "@/components/partner/ReliabilityCard";
import { PARTNER_APP_VERSION, PARTNER_BUILD_ID } from "@/lib/buildInfo";
import { toast } from "sonner";
import { useSignOut } from "@/hooks/use-sign-out";

import { PartnerShell } from "@/components/partner/PartnerShell";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: () => (
    <PartnerShell>
      <ProfilePage />
    </PartnerShell>
  ),
});

function ProfilePage() {
  const navigate = useNavigate();
  const { signOut } = useSignOut();
  const { t } = useI18n();
  const { data: partner } = useQuery({
    queryKey: ["me-partner-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("partners").select("*").eq("id", u.user!.id).maybeSingle();
      return data;
    },
  });

  const handleSignOut = async () => {
    await signOut("/");
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
    <div className="mx-auto max-w-md px-5 pt-3 pb-32 space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#1A1A1A]">Profile</h1>
        <p className="text-sm text-muted-foreground font-medium">Manage your account and settings</p>
      </header>

      <Card className="p-6 border-neutral-100 shadow-sm bg-white rounded-3xl">
        <div className="flex items-center gap-5">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#FF6B00] text-white text-xl font-black shadow-lg shadow-[#FF6B00]/20">
            {partner?.full_name?.[0] ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black text-[#1A1A1A]">{partner?.full_name ?? t("partner")}</h2>
            <p className="text-sm font-bold text-muted-foreground mt-0.5">+91 {partner?.phone}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF6B00]">{partner?.partner_code}</span>
              <Badge className="border-0 bg-neutral-100 text-[#1A1A1A] rounded-lg text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                <Award className="mr-1.5 h-3 w-3 text-[#FF6B00]" strokeWidth={3} />
                {partner?.level ?? "Bronze"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-3 border-t border-neutral-50 pt-6 text-center">
          <StatMini value={String(partner?.total_cars_completed ?? 0)} label={t("cars")} />
          <StatMini value={`${Number(partner?.attendance_pct ?? 100).toFixed(0)}%`} label={t("attendance")} />
          <StatMini value={`₹${Number(partner?.lifetime_earnings ?? 0).toLocaleString("en-IN")}`} label={t("lifetime")} />
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
      <div className="mt-3 flex flex-wrap gap-2">
        {verifications.map((v) => (
          <span
            key={v.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
              v.ok
                ? "bg-[color:var(--success)]/12 text-[color:var(--success)]"
                : "bg-primary/12 text-primary"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${v.ok ? "bg-[color:var(--success)]" : "bg-primary"}`} />
            {v.label} {v.ok ? t("verified") : t("pending")}
          </span>
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




      <Card className="mt-3 border-dashed p-3 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Partner Build</p>
        <p className="mt-1 text-sm font-semibold">v{PARTNER_APP_VERSION}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{PARTNER_BUILD_ID}</p>
      </Card>

      <Button variant="outline" className="mt-3 w-full" onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" /> {t("sign_out")}
      </Button>
      <div className="h-6" />
    </div>
  );
}

function StatMini({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-lg font-black text-[#1A1A1A] tracking-tighter">{value}</p>
      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{label}</p>
    </div>
  );
}


