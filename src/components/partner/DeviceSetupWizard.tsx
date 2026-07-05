/**
 * DeviceSetupWizard — one-time guided setup on native Android to ensure
 * marketplace offers actually reach the partner even when the phone is
 * locked, the app is swiped away, or aggressive OEMs kill background
 * services (Xiaomi, Vivo, Oppo, Realme, Samsung, OnePlus).
 *
 * Rendered on the partner dashboard the first time the app boots. Persists
 * completion in Capacitor Preferences so it only runs once — the partner can
 * always re-open it from the profile page in a future iteration.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { isNative } from "@/lib/platform";

const DONE_KEY = "urbanwash.device_setup_done_v1";

type Manufacturer =
  | "xiaomi"
  | "vivo"
  | "oppo"
  | "realme"
  | "samsung"
  | "oneplus"
  | "generic";

const INSTRUCTIONS: Record<Manufacturer, string[]> = {
  xiaomi: [
    "Settings → Apps → Manage apps → Urban Wash → Autostart: ON",
    "Settings → Battery → App battery saver → Urban Wash → No restrictions",
    "Recent apps → long-press Urban Wash → 🔒 Lock",
    "Settings → Notifications → Urban Wash → Lock-screen: ON, Sound: ON, Pop-up on screen: ON",
  ],
  vivo: [
    "Settings → Battery → Background power consumption → Urban Wash: Allow",
    "Settings → Battery → High background power consumption → Urban Wash: Allow",
    "Settings → Apps → Urban Wash → Auto-start: ON",
    "Settings → Notifications → Urban Wash → Lock-screen: ON, Banner: ON",
  ],
  oppo: [
    "Settings → Battery → Power Saving → Urban Wash → Allow background activity",
    "Settings → App management → Auto-launch → Urban Wash: ON",
    "Settings → Notification & status bar → Urban Wash → Allow, Lock screen: ON, Banner: ON",
  ],
  realme: [
    "Settings → Battery → App Battery Management → Urban Wash → Allow background activity",
    "Settings → App management → Auto-launch → Urban Wash: ON",
    "Settings → Notifications → Urban Wash → Lock-screen: ON, Sound: ON, Banner: ON",
  ],
  samsung: [
    "Settings → Apps → Urban Wash → Battery → Unrestricted",
    "Settings → Device care → Battery → Background usage limits → remove Urban Wash from Sleeping apps",
    "Settings → Notifications → Urban Wash → Allow sound and vibration + Lock-screen: ON",
  ],
  oneplus: [
    "Settings → Battery → Battery optimization → Urban Wash: Don't optimize",
    "Settings → Apps → Urban Wash → Battery → Allow background activity",
    "Settings → Notifications → Urban Wash → Sound + Lock-screen: ON",
  ],
  generic: [
    "Settings → Apps → Urban Wash → Battery: Unrestricted / Don't optimize",
    "Settings → Apps → Urban Wash → Auto-start: ON (if available)",
    "Settings → Notifications → Urban Wash → Sound + Lock-screen: ON",
  ],
};

const BRAND_LABEL: Record<Manufacturer, string> = {
  xiaomi: "Xiaomi / Redmi / POCO",
  vivo: "Vivo / iQOO",
  oppo: "Oppo",
  realme: "Realme",
  samsung: "Samsung",
  oneplus: "OnePlus",
  generic: "Your device",
};

function detectManufacturer(raw: string | undefined): Manufacturer {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("xiaomi") || s.includes("redmi") || s.includes("poco")) return "xiaomi";
  if (s.includes("vivo") || s.includes("iqoo")) return "vivo";
  if (s.includes("oppo")) return "oppo";
  if (s.includes("realme")) return "realme";
  if (s.includes("samsung")) return "samsung";
  if (s.includes("oneplus")) return "oneplus";
  return "generic";
}

export function DeviceSetupWizard() {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState<Manufacturer>("generic");

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        const done = (await Preferences.get({ key: DONE_KEY })).value;
        if (done === "1" || cancelled) return;
        const { Device } = await import("@capacitor/device");
        const info = await Device.getInfo();
        if (cancelled) return;
        setBrand(detectManufacturer(info.manufacturer));
        setOpen(true);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async (done: boolean) => {
    setOpen(false);
    try {
      const { Preferences } = await import("@capacitor/preferences");
      if (done) await Preferences.set({ key: DONE_KEY, value: "1" });
    } catch { /* noop */ }
  };

  if (!open) return null;
  const steps = INSTRUCTIONS[brand];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void dismiss(false); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Never miss a customer
          </DialogTitle>
          <DialogDescription>
            Your phone ({BRAND_LABEL[brand]}) may block Urban Wash from waking
            up for new leads. Enable these 4 settings once and you'll receive
            every offer instantly, even on the lock screen.
          </DialogDescription>
        </DialogHeader>

        <ol className="mt-2 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </div>
              <div className="text-sm">{s}</div>
              <ChevronRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ol>

        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-1 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Why this matters
          </div>
          Without these permissions, your phone can silently drop lead
          notifications while you're not looking — costing you real customers.
        </div>

        <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => void dismiss(false)}>
            Remind me later
          </Button>
          <Button onClick={() => void dismiss(true)}>I've done this</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
