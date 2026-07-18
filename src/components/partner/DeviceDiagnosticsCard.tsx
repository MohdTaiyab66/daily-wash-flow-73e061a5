/**
 * Device Diagnostics — read-only snapshot of the state that most commonly
 * breaks Android push notifications. Everything is best-effort: on web every
 * native field falls back to "—" so the card renders without errors.
 */
import { useEffect, useState } from "react";
import { Device } from "@capacitor/device";
import { Preferences } from "@capacitor/preferences";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { Card } from "@/components/ui/card";
import { Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform } from "@/lib/platform";
import { PARTNER_APP_VERSION, PARTNER_BUILD_ID } from "@/lib/buildInfo";

type Diag = {
  device: string;
  osVersion: string;
  platform: string;
  appVersion: string;
  buildId: string;
  fcmToken: string;
  fcmTokenStatus: "registered" | "missing" | "web";
  permission: string;
  batteryLevel: string;
  channels: Array<{ id: string; importance: number; enabled?: boolean }>;
  lastPushAt: string;
  lastOpenAt: string;
};

async function loadDiagnostics(userId: string | null): Promise<Diag> {
  const web = !isNative();
  const empty: Diag = {
    device: "—",
    osVersion: "—",
    platform: web ? "web" : nativePlatform(),
    appVersion: PARTNER_APP_VERSION,
    buildId: PARTNER_BUILD_ID,
    fcmToken: web ? "web (n/a)" : "—",
    fcmTokenStatus: web ? "web" : "missing",
    permission: web ? "n/a" : "—",
    batteryLevel: "—",
    channels: [],
    lastPushAt: "—",
    lastOpenAt: "—",
  };
  if (web) return empty;

  try {
    const info = await Device.getInfo();
    empty.device = `${info.manufacturer ?? ""} ${info.model ?? ""}`.trim() || "Unknown";
    empty.osVersion = `${info.operatingSystem ?? ""} ${info.osVersion ?? ""}`.trim();
  } catch { /* noop */ }

  try {
    const bat = await Device.getBatteryInfo();
    if (typeof bat.batteryLevel === "number") {
      empty.batteryLevel = `${Math.round(bat.batteryLevel * 100)}%${bat.isCharging ? " · charging" : ""}`;
    }
  } catch { /* noop */ }

  try {
    const perm = await FirebaseMessaging.checkPermissions();
    empty.permission = perm.receive;
  } catch { /* noop */ }

  try {
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      empty.fcmToken = `…${token.slice(-16)}`;
      empty.fcmTokenStatus = "registered";
    }
  } catch { /* noop */ }

  try {
    const { channels } = await FirebaseMessaging.listChannels();
    empty.channels = (channels ?? []).map((c) => ({
      id: c.id,
      importance: c.importance ?? 0,
    }));
  } catch { /* noop */ }

  try {
    const lp = await Preferences.get({ key: "urbanwash.last_push_at" });
    if (lp.value) empty.lastPushAt = new Date(lp.value).toLocaleString("en-IN");
    const lo = await Preferences.get({ key: "urbanwash.last_push_opened_at" });
    if (lo.value) empty.lastOpenAt = new Date(lo.value).toLocaleString("en-IN");
  } catch { /* noop */ }

  // Cross-check server-side token registration
  if (userId && empty.fcmTokenStatus === "registered") {
    try {
      const { data } = await supabase
        .from("push_tokens")
        .select("id, invalid_at")
        .eq("user_id", userId)
        .is("invalid_at", null)
        .limit(1)
        .maybeSingle();
      if (!data) empty.fcmTokenStatus = "missing";
    } catch { /* noop */ }
  }

  return empty;
}

function importanceLabel(v: number): string {
  return v >= 5 ? "MAX" : v === 4 ? "HIGH" : v === 3 ? "DEFAULT" : v === 2 ? "LOW" : v === 1 ? "MIN" : "NONE";
}

export function DeviceDiagnosticsCard({ userId }: { userId: string | null | undefined }) {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setDiag(await loadDiagnostics(userId ?? null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const targetChannels = ["assignments_v3", "offers_v3", "assignments", "offers", "general"];
  const channelRows = diag
    ? targetChannels
        .map((id) => ({ id, found: diag.channels.find((c) => c.id === id) }))
        .filter((r) => r.found)
    : [];

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Device Diagnostics</p>
        </div>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {!diag ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-3 space-y-1.5 text-[11px] leading-relaxed">
          <Row label="Device" value={diag.device} />
          <Row label="OS" value={diag.osVersion} />
          <Row label="Platform" value={diag.platform} />
          <Row label="App" value={`v${diag.appVersion} (${diag.buildId})`} />
          <Row
            label="FCM Token"
            value={
              diag.fcmTokenStatus === "registered"
                ? `Registered ✅ ${diag.fcmToken}`
                : diag.fcmTokenStatus === "web"
                  ? "Web (no FCM)"
                  : "Missing ❌"
            }
            valueClass={
              diag.fcmTokenStatus === "registered"
                ? "text-[color:var(--success)]"
                : diag.fcmTokenStatus === "missing"
                  ? "text-destructive"
                  : ""
            }
          />
          <Row
            label="Notification Permission"
            value={diag.permission === "granted" ? "Granted ✅" : diag.permission}
            valueClass={diag.permission === "granted" ? "text-[color:var(--success)]" : "text-destructive"}
          />
          <Row label="Battery" value={diag.batteryLevel} />
          <Row label="Last push received" value={diag.lastPushAt} />
          <Row label="Last push tapped" value={diag.lastOpenAt} />
          {channelRows.length > 0 && (
            <div className="mt-2 rounded-md border border-dashed p-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Channels</p>
              {channelRows.map((c) => (
                <div key={c.id} className="flex items-center justify-between font-mono">
                  <span>{c.id}</span>
                  <span
                    className={
                      (c.found?.importance ?? 0) >= 4
                        ? "text-[color:var(--success)]"
                        : "text-destructive"
                    }
                  >
                    {importanceLabel(c.found?.importance ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Battery optimization state can't be read from JS — check manually in
            Settings → Apps → Urban Wash Partner → Battery → Unrestricted.
          </p>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-mono ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}
