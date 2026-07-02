import { supabase } from "@/integrations/supabase/client";
import { appVariant, isNative, nativePlatform } from "@/lib/platform";
import type { GpsPoint } from "@/lib/native";

type EvidenceArgs = {
  eventType: string;
  serviceId?: string | null;
  assignmentId?: string | null;
  gps?: GpsPoint | null;
  status?: "info" | "success" | "error" | "blocked";
  payload?: Record<string, unknown>;
};

export async function logApkEvidence({
  eventType,
  serviceId = null,
  assignmentId = null,
  gps = null,
  status = "info",
  payload = {},
}: EvidenceArgs) {
  try {
    await (supabase as any).rpc("log_partner_apk_workflow_event", {
      p_event_type: eventType,
      p_service_id: serviceId,
      p_assignment_id: assignmentId,
      p_platform: nativePlatform(),
      p_app_variant: appVariant(),
      p_is_native: isNative(),
      p_lat: gps?.lat ?? null,
      p_lng: gps?.lng ?? null,
      p_accuracy: gps?.accuracy ?? null,
      p_status: status,
      p_payload: payload,
    });
  } catch (err) {
    // Evidence logging must never block a live field workflow.
    console.warn("[apk-evidence] log failed", eventType, err);
  }
}

export function evidenceError(err: unknown) {
  const e = err as { message?: string; code?: string; name?: string };
  return {
    name: e?.name ?? "Error",
    code: e?.code ?? null,
    message: e?.message ?? String(err),
  };
}