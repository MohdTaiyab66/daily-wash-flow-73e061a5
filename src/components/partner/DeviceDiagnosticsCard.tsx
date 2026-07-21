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
  currentTokenHash: string;
  lastTokenRefreshAt: string;
  lastTokenUploadAt: string;
  lastTokenUploadError: string;
  tokenUploadedMatch: "match" | "mismatch" | "unknown";
  serverTokenTail: string;
  lastFcm: {
    time: string;
    payloadType: string;
    channel: string;
    messageId: string;
    displayed: boolean | null;
    displayPath: string;
  } | null;
};

function tail(t: string | null | undefined, n = 12): string {
  if (!t) return "—";
  return t.length <= n ? t : `…${t.slice(-n)}`;
}

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
    currentTokenHash: "—",
    lastTokenRefreshAt: "—",
    lastTokenUploadAt: "—",
    lastTokenUploadError: "",
    tokenUploadedMatch: "unknown",
    serverTokenTail: "—",
    lastFcm: null,
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

  let currentToken: string | null = null;
  try {
    const { token } = await FirebaseMessaging.getToken();
    if (token) {
      currentToken = token;
      empty.fcmToken = tail(token, 16);
      empty.currentTokenHash = tail(token, 12);
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
    const lr = await Preferences.get({ key: "urbanwash.last_token_refresh_at" });
    if (lr.value) empty.lastTokenRefreshAt = new Date(lr.value).toLocaleString("en-IN");
    const lu = await Preferences.get({ key: "urbanwash.last_token_upload_at" });
    if (lu.value) empty.lastTokenUploadAt = new Date(lu.value).toLocaleString("en-IN");
    const lue = await Preferences.get({ key: "urbanwash.last_token_upload_error" });
    if (lue.value) empty.lastTokenUploadError = lue.value;
    const lf = await Preferences.get({ key: "urbanwash.last_fcm_meta" });
    if (lf.value) {
      try {
        const m = JSON.parse(lf.value);
        empty.lastFcm = {
          time: m.time ? new Date(m.time).toLocaleString("en-IN") : "—",
          payloadType: m.payloadType ?? "—",
          channel: m.channel ?? "—",
          messageId: m.messageId ?? "—",
          displayed: typeof m.displayed === "boolean" ? m.displayed : null,
          displayPath: m.displayPath ?? "—",
        };
      } catch { /* noop */ }
    }
  } catch { /* noop */ }

  // Cross-check server: does the row in push_tokens match the current token?
  if (userId && currentToken) {
    try {
      const { data } = await supabase
        .from("push_tokens")
        .select("token, invalid_at, last_seen")
        .eq("user_id", userId)
        .is("invalid_at", null)
        .order("last_seen", { ascending: false })
        .limit(5);
      const rows = (data ?? []) as Array<{ token: string; last_seen: string | null }>;
      const match = rows.find((r) => r.token === currentToken);
      if (rows.length === 0) {
        empty.fcmTokenStatus = "missing";
        empty.tokenUploadedMatch = "mismatch";
      } else if (match) {
        empty.tokenUploadedMatch = "match";
        empty.serverTokenTail = tail(match.token, 12);
      } else {
        empty.tokenUploadedMatch = "mismatch";
        empty.serverTokenTail = tail(rows[0].token, 12);
      }
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
            label="Local FCM Token"
            value={
              diag.fcmTokenStatus === "registered"
                ? `Present ✅ ${diag.fcmToken}`
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
            label="Server Registration"
            value={
              diag.tokenUploadedMatch === "match"
                ? "Present ✅"
                : diag.tokenUploadedMatch === "mismatch"
                  ? "Missing ❌"
                  : "unknown"
            }
            valueClass={
              diag.tokenUploadedMatch === "match"
                ? "text-[color:var(--success)]"
                : diag.tokenUploadedMatch === "mismatch"
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

          <div className="mt-2 rounded-md border border-dashed p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Token sync</p>
            <Row label="Current token" value={diag.currentTokenHash} />
            <Row label="Last token refresh" value={diag.lastTokenRefreshAt} />
            <Row label="Last upload to server" value={diag.lastTokenUploadAt} />
            <Row
              label="Client ↔ server token"
              value={
                diag.tokenUploadedMatch === "match"
                  ? "MATCH ✅"
                  : diag.tokenUploadedMatch === "mismatch"
                    ? `MISMATCH ❌  server: ${diag.serverTokenTail}`
                    : "unknown"
              }
              valueClass={
                diag.tokenUploadedMatch === "match"
                  ? "text-[color:var(--success)]"
                  : diag.tokenUploadedMatch === "mismatch"
                    ? "text-destructive"
                    : ""
              }
            />
            {diag.lastTokenUploadError ? (
              <Row label="Last upload error" value={diag.lastTokenUploadError} valueClass="text-destructive" />
            ) : null}
          </div>


          <div className="mt-2 rounded-md border border-dashed p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Last FCM Received</p>
            {diag.lastFcm ? (
              <>
                <Row label="Time" value={diag.lastFcm.time} />
                <Row label="Payload Type" value={diag.lastFcm.payloadType} />
                <Row label="Channel" value={diag.lastFcm.channel} />
                <Row label="Message ID" value={diag.lastFcm.messageId} />
                <Row
                  label="Notification Displayed"
                  value={diag.lastFcm.displayed === true ? "YES ✅" : diag.lastFcm.displayed === false ? "NO ❌" : "—"}
                  valueClass={
                    diag.lastFcm.displayed === true
                      ? "text-[color:var(--success)]"
                      : diag.lastFcm.displayed === false
                        ? "text-destructive"
                        : ""
                  }
                />
                <Row label="Display Path" value={diag.lastFcm.displayPath} />
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">No push received on this device yet.</p>
            )}
          </div>

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
