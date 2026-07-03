import { isNative } from "@/lib/platform";

export const CAMERA_PENDING_KEY = "uw_partner_camera_pending";

type PendingCapture = {
  serviceId?: string | null;
  assignmentId?: string | null;
  workflow?: string;
  stage?: string;
  angle?: string;
  slot?: string;
  pathname?: string;
  at?: number;
};

export function readPendingCapture(): PendingCapture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CAMERA_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCapture;
    if (!parsed.at || Date.now() - parsed.at > 10 * 60 * 1000) {
      clearPendingCapture();
      return null;
    }
    return parsed;
  } catch {
    clearPendingCapture();
    return null;
  }
}

export function persistPendingCapture(context: Omit<PendingCapture, "pathname" | "at">) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      CAMERA_PENDING_KEY,
      JSON.stringify({ ...context, pathname: window.location.pathname, at: Date.now() }),
    );
  } catch {
    // Storage is best-effort only; capture must not be blocked.
  }
}

export function clearPendingCapture() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CAMERA_PENDING_KEY);
  } catch {
    // noop
  }
}

export function installCameraRouteRestore() {
  if (typeof window === "undefined" || !isNative()) return () => {};

  let cancelled = false;
  void import("@capacitor/app")
    .then(({ App }) => App.addListener("appRestoredResult", () => {
      if (cancelled) return;
      const pending = readPendingCapture();
      if (!pending?.pathname) return;
      if (window.location.pathname !== pending.pathname) {
        window.history.replaceState(window.history.state, "", pending.pathname);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }))
    .catch(() => null);

  return () => {
    cancelled = true;
  };
}