import { isNative } from "@/lib/platform";

export const CAMERA_PENDING_KEY = "uw_partner_camera_pending";
export const CAMERA_RESTORED_KEY = "uw_partner_camera_restored";

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

export type RestoredCapture = PendingCapture & {
  base64String?: string;
  format?: string;
  uri?: string;
  webPath?: string;
};

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(key, value); } catch { /* noop */ }
  try { window.localStorage.setItem(key, value); } catch { /* noop */ }
}

function removeStorage(key: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(key); } catch { /* noop */ }
  try { window.localStorage.removeItem(key); } catch { /* noop */ }
}

export function readPendingCapture(): PendingCapture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readStorage(CAMERA_PENDING_KEY);
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
    writeStorage(
      CAMERA_PENDING_KEY,
      JSON.stringify({ ...context, pathname: window.location.pathname, at: Date.now() }),
    );
  } catch {
    // Storage is best-effort only; capture must not be blocked.
  }
}

export function clearPendingCapture() {
  if (typeof window === "undefined") return;
  removeStorage(CAMERA_PENDING_KEY);
}

function saveRestoredCapture(data: unknown) {
  const pending = readPendingCapture();
  const photo = data as { base64String?: string; thumbnail?: string; format?: string; metadata?: { format?: string }; uri?: string; webPath?: string; path?: string } | null;
  const base64String = photo?.base64String ?? photo?.thumbnail;
  const uri = photo?.uri ?? photo?.path;
  if (!pending?.slot || (!base64String && !photo?.webPath && !uri)) return;
  writeStorage(
    CAMERA_RESTORED_KEY,
    JSON.stringify({
      ...pending,
      base64String,
      uri,
      webPath: photo?.webPath,
      format: photo?.format ?? photo?.metadata?.format ?? "jpeg",
      at: Date.now(),
    }),
  );
}

export function consumeRestoredCapture(slot: string): RestoredCapture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readStorage(CAMERA_RESTORED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestoredCapture;
    if (!parsed.at || Date.now() - parsed.at > 10 * 60 * 1000) {
      removeStorage(CAMERA_RESTORED_KEY);
      return null;
    }
    if (parsed.slot !== slot) return null;
    removeStorage(CAMERA_RESTORED_KEY);
    clearPendingCapture();
    return parsed;
  } catch {
    removeStorage(CAMERA_RESTORED_KEY);
    return null;
  }
}

/**
 * Non-destructive peek at whichever capture context is currently pending or
 * restored. Used on route mount to know which dialog to re-open after the
 * Android WebView was killed while the native camera was foreground —
 * without this the PhotoSlot inside the closed dialog never mounts and the
 * restored photo is stranded in storage.
 */
export function peekCaptureContext(): PendingCapture | null {
  if (typeof window === "undefined") return null;
  const readOne = (key: string): PendingCapture | null => {
    const raw = readStorage(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PendingCapture;
      if (!parsed.at || Date.now() - parsed.at > 10 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  };
  return readOne(CAMERA_RESTORED_KEY) ?? readOne(CAMERA_PENDING_KEY);
}

export function installCameraRouteRestore() {
  if (typeof window === "undefined" || !isNative()) return () => {};

  let cancelled = false;
  const restoreRoute = () => {
    if (cancelled) return;
    const pending = readPendingCapture();
    if (!pending?.pathname) return;
    if (window.location.pathname !== pending.pathname) {
      window.history.replaceState(window.history.state, "", pending.pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  void import("@capacitor/app")
    .then(({ App }) => {
      void App.addListener("appRestoredResult", (event: { pluginId?: string; methodName?: string; data?: unknown }) => {
        if (event?.pluginId === "Camera" && (event?.methodName === "getPhoto" || event?.methodName === "takePhoto")) saveRestoredCapture(event.data);
        restoreRoute();
      });
      void App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) window.setTimeout(restoreRoute, 50);
      });
      void App.addListener("resume", () => window.setTimeout(restoreRoute, 50));
    })
    .catch(() => null);

  return () => {
    cancelled = true;
  };
}