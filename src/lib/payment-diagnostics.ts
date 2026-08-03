import { isNative } from "@/lib/platform";

const STORAGE_KEY = "uw_payment_diagnostics";
const MAX_LOCAL_CHARS = 180_000;
const REDACTED = "[REDACTED]";

type Jsonish = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

function isSensitiveKey(key: string) {
  const k = key.toLowerCase();
  return k === "secret" || k === "key_secret" || k.endsWith("_secret") || k.includes("signature");
}

function isPublicPaymentKey(key: string) {
  const k = key.toLowerCase();
  return k === "key" || k === "keyid" || k === "key_id";
}

function maskValue(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return "";
  if (raw.length <= 8) return REDACTED;
  return `${raw.slice(0, 8)}…${raw.slice(-4)}`;
}

export function sanitizePaymentDiagnostic(value: Jsonish): Jsonish {
  if (Array.isArray(value)) return value.map((item) => sanitizePaymentDiagnostic(item as Jsonish));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key)
        ? REDACTED
        : isPublicPaymentKey(key)
          ? maskValue(nested)
          : sanitizePaymentDiagnostic(nested as Jsonish);
    }
    return out;
  }
  return value;
}

function stringify(value: unknown) {
  if (value === undefined) return "";
  try {
    return JSON.stringify(sanitizePaymentDiagnostic(value as Jsonish));
  } catch {
    return String(value);
  }
}

function appendLocal(line: string) {
  if (typeof window === "undefined") return;
  try {
    const current = window.localStorage.getItem(STORAGE_KEY) ?? "";
    const next = `${current}${current ? "\n" : ""}${line}`.slice(-MAX_LOCAL_CHARS);
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Diagnostics must never break checkout.
  }
}

async function callNative(method: string, payload?: Record<string, unknown>) {
  if (!isNative()) return null;
  try {
    const { UrbanWashCheckout } = await import("@/lib/razorpay-checkout");
    const plugin = UrbanWashCheckout as unknown as Record<string, any>;
    if (typeof plugin?.[method] !== "function") return null;
    return await plugin[method](payload ?? {});
  } catch {
    return null;
  }
}


export async function appendPaymentDiagnostic(label: string, data?: Jsonish) {
  const payload = stringify(data);
  const line = `${new Date().toISOString()} ${label}${payload ? ` ${payload}` : ""}`;
  appendLocal(line);
  try {
    console.info("[UW_PAY_DIAG]", label, sanitizePaymentDiagnostic(data));
  } catch {
    // noop
  }
  void callNative("recordDiagnostics", { line });
}

export function getLocalPaymentDiagnostics() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function getNativePaymentDiagnostics() {
  return (await callNative("getDiagnostics")) as Record<string, unknown> | null;
}

function exportBrowserText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportPaymentDiagnosticsFile() {
  await appendPaymentDiagnostic("Diagnostics export requested");
  const nativeResult = await callNative("exportDiagnostics", { webDiagnostics: getLocalPaymentDiagnostics() });
  if (nativeResult) return nativeResult as Record<string, unknown>;

  const nativeSnapshot = await getNativePaymentDiagnostics();
  const text = [
    "Urban Wash payment diagnostics",
    `Exported: ${new Date().toISOString()}`,
    nativeSnapshot ? `Native snapshot: ${stringify(nativeSnapshot)}` : "Native snapshot: unavailable",
    "",
    getLocalPaymentDiagnostics() || "No payment diagnostics recorded on this device yet.",
  ].join("\n");
  exportBrowserText("payment-diagnostics.txt", text);
  return { filename: "payment-diagnostics.txt", shared: false };
}

export function formatUpiUnavailableMessage(diag: Record<string, unknown> | null, reason: string, merchantKey?: string) {
  const packages = (diag?.upiPackages ?? diag?.packages ?? {}) as Record<string, unknown>;
  const found = Object.entries(packages)
    .filter(([, value]) => value === true)
    .map(([key]) => key)
    .join(", ") || "none detected";
  const sdk = String(diag?.sdkVersion ?? diag?.sdkImplementationVersion ?? diag?.configuredSdkVersion ?? "unknown");
  const plugin = String(diag?.pluginVersion ?? "UrbanWashCheckout (app-owned)");

  return [
    "UPI unavailable.",
    `SDK Version: ${sdk}`,
    `Plugin Version: ${plugin}`,
    `Merchant: ${merchantKey ? maskValue(merchantKey) : "unknown"}`,
    `Packages Found: ${found}`,
    `Reason: ${reason || "Razorpay native checkout did not expose UPI on this device."}`,
  ].join("\n");
}