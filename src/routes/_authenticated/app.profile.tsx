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
import { sendPushSelfTest } from "@/lib/push-selftest.functions";
import { DeviceDiagnosticsCard } from "@/components/partner/DeviceDiagnosticsCard";
import { toast } from "sonner";

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

      <DeviceDiagnosticsCard userId={partner?.id ?? null} />

      <PushSelfTestCard />



      <Card className="mt-3 border-dashed p-3 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Partner Build</p>
        <p className="mt-1 text-sm font-semibold">v{PARTNER_APP_VERSION}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{PARTNER_BUILD_ID}</p>
      </Card>

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

function PushSelfTestCard() {
  const run = useServerFn(sendPushSelfTest);
  const [busy, setBusy] = useState<null | "offer" | "assignment" | "generic">(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [last, setLast] = useState<null | {
    schemaVersion?: number;
    serverBuild?: string;
    scenario: string;
    sent: number;
    failed: number;
    tokenCount: number;
    channelId: string;
    payloadType: string;
    dataOnly: boolean;
    at: string;
    runtime?: string;
    env?: { projectId: boolean; clientEmail: boolean; privateKey: boolean };
    error?: string | null;
    results: Array<{
      ok: boolean;
      httpStatus: string;
      messageId: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      tokenTail: string | null;
    }>;
  }>(null);

  const fire = async (scenario: "offer" | "assignment" | "generic") => {
    setBusy(scenario);
    try {
      let r: any = null;
      try {
        r = await run({ data: { scenario } });
      } catch (rpcErr: any) {
        // eslint-disable-next-line no-console
        console.error("[push-selftest] RPC threw", rpcErr, rpcErr?.stack);
        toast.error("Self-test request failed", {
          description: rpcErr?.message ?? String(rpcErr),
        });
        setLast({
          scenario,
          sent: 0,
          failed: 0,
          tokenCount: 0,
          channelId: "—",
          payloadType: "—",
          dataOnly: false,
          at: new Date().toLocaleTimeString("en-IN"),
          error: `RPC error: ${rpcErr?.message ?? String(rpcErr)}`,
          results: [],
        });
        return;
      }

      if (r?.schemaVersion !== 2) {
        // eslint-disable-next-line no-console
        console.warn("[push-selftest] schema mismatch", { got: r?.schemaVersion, expected: 2 });
      }

      setLast({
        schemaVersion: r?.schemaVersion,
        serverBuild: r?.serverBuild,
        scenario,
        sent: r?.sent ?? 0,
        failed: r?.failed ?? 0,
        tokenCount: r?.tokenCount ?? 0,
        channelId: r?.channelId ?? "—",
        payloadType: r?.payloadType ?? "—",
        dataOnly: !!r?.dataOnly,
        at: new Date().toLocaleTimeString("en-IN"),
        runtime: r?.runtime,
        env: r?.env,
        error: r?.error ?? null,
        results: Array.isArray(r?.results) ? r.results : [],
      });

      if ((r?.sent ?? 0) > 0) {
        toast.success(`Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}`, {
          description: "If heads-up doesn't appear, check the diagnostics card above.",
        });
      } else if ((r?.tokenCount ?? 0) === 0) {
        toast.error("No push tokens registered", {
          description: "Reopen the app with notifications allowed, then retry.",
        });
      } else if (r?.error) {
        toast.error("Self-test error", { description: r.error });
      } else {
        toast.error("FCM rejected every token", {
          description: r?.results?.[0]?.errorCode ?? "See detail below.",
        });
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[push-selftest] handler fatal", e, e?.stack);
      toast.error("Self-test failed", { description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Notification self-test</p>
      </div>
      <ol className="mt-2 space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted-foreground list-decimal">
        <li>App foreground → tap Offer Test → expect heads-up + sound.</li>
        <li>Home button (background) → tap Offer Test → expect heads-up.</li>
        <li>Swipe app from Recents (killed) → tap Offer Test → expect lock-screen alert.</li>
      </ol>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Only test Assignment / Generic <b>after</b> Offer works in all three states.
      </p>
      <Button
        className="mt-3 w-full"
        disabled={busy !== null}
        onClick={() => fire("offer")}
      >
        {busy === "offer" ? "Sending…" : "▶  Offer Test (start here)"}
      </Button>
      <button
        type="button"
        className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground underline"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide advanced" : "Advanced scenarios"}
      </button>
      {showAdvanced && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => fire("assignment")}>
            {busy === "assignment" ? "Sending…" : "Assignment"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => fire("generic")}>
            {busy === "generic" ? "Sending…" : "Generic"}
          </Button>
        </div>
      )}
      {last && (
        <div className="mt-3 space-y-2 rounded-md border border-dashed p-2 text-[11px] leading-relaxed">
          <div className="flex items-center justify-between">
            <span className="font-mono">{last.at}</span>
            <span
              className={
                last.sent > 0 ? "font-semibold text-[color:var(--success)]" : "font-semibold text-destructive"
              }
            >
              {last.sent}/{last.tokenCount} delivered
            </span>
          </div>
          {last.env && (
            <div className="rounded border border-dashed p-1.5 font-mono text-[10px]">
              <div className="mb-0.5 text-muted-foreground">
                Backend runtime: {last.runtime ?? "unknown"}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span className="text-muted-foreground">FIREBASE_PROJECT_ID</span>
                <span className={last.env.projectId ? "text-[color:var(--success)]" : "text-destructive"}>
                  {last.env.projectId ? "present ✅" : "missing ❌"}
                </span>
                <span className="text-muted-foreground">FIREBASE_CLIENT_EMAIL</span>
                <span className={last.env.clientEmail ? "text-[color:var(--success)]" : "text-destructive"}>
                  {last.env.clientEmail ? "present ✅" : "missing ❌"}
                </span>
                <span className="text-muted-foreground">FIREBASE_PRIVATE_KEY</span>
                <span className={last.env.privateKey ? "text-[color:var(--success)]" : "text-destructive"}>
                  {last.env.privateKey ? "present ✅" : "missing ❌"}
                </span>
              </div>
              {last.error && <div className="mt-1 text-destructive">{last.error}</div>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
            <span className="text-muted-foreground">Scenario</span><span>{last.scenario}</span>
            <span className="text-muted-foreground">Payload type</span><span>{last.payloadType}</span>
            <span className="text-muted-foreground">Channel</span><span>{last.channelId}</span>
            <span className="text-muted-foreground">Data-only</span><span>{last.dataOnly ? "yes" : "no"}</span>
          </div>

          {last.results.map((r, i) => (
            <div key={i} className="rounded border p-1.5 font-mono text-[10px]">
              <div className="flex items-center justify-between">
                <span>Token …{r.tokenTail ?? "?"}</span>
                <span className={r.ok ? "text-[color:var(--success)]" : "text-destructive"}>
                  FCM {r.httpStatus}
                </span>
              </div>
              {r.messageId && (
                <div className="mt-0.5 break-all text-muted-foreground">msg: {r.messageId}</div>
              )}
              {r.errorMessage && (
                <div className="mt-0.5 break-all text-destructive">{r.errorMessage}</div>
              )}
            </div>
          ))}
          {last.sent > 0 && (
            <p className="text-[10px] text-muted-foreground">
              200 OK + no visible alert → issue is on Android (channel importance,
              battery optimization, or OEM heads-up policy), not FCM.
            </p>
          )}
        </div>
      )}
    </Card>
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
