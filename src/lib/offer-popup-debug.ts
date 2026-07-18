type PopupDebugPayload = Record<string, unknown>;

function stack() {
  return new Error().stack ?? "stack unavailable";
}

export function popupDebug(label: string, payload: PopupDebugPayload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    client_now: new Date().toISOString(),
    ...payload,
    call_stack: payload.call_stack ?? stack(),
  };
  // eslint-disable-next-line no-console
  console.info(`[UW_POPUP_DEBUG] ${label}`, entry);
  return entry;
}

export function tracePopupOpen(payload: PopupDebugPayload = {}) {
  const entry = popupDebug("POPUP OPEN", payload);
  // eslint-disable-next-line no-console
  console.trace("Popup opened", entry);
  return entry;
}

export function remainingSecondsFrom(expiresAt?: string | null, nowMs = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / 1000));
}