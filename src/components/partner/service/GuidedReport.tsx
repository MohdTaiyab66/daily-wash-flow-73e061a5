import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

import { PhotoSlot, getPosition, pickPhotoPaths, type ServicePhotoRow } from "./photo-slot";

export type ReportReason = { value: string; label: string };

const draftKey = (serviceId: string, kind: string) => `uw_report_draft:${kind}:${serviceId}`;

function readDraft(serviceId: string, kind: string) {
  if (typeof window === "undefined") return { reason: "", notes: "" };
  try {
    const raw = window.localStorage.getItem(draftKey(serviceId, kind));
    if (!raw) return { reason: "", notes: "" };
    const p = JSON.parse(raw) as { reason?: string; notes?: string };
    return { reason: p.reason ?? "", notes: p.notes ?? "" };
  } catch {
    return { reason: "", notes: "" };
  }
}

function writeDraft(serviceId: string, kind: string, draft: { reason: string; notes: string }) {
  if (typeof window === "undefined") return;
  try {
    if (!draft.reason && !draft.notes) window.localStorage.removeItem(draftKey(serviceId, kind));
    else window.localStorage.setItem(draftKey(serviceId, kind), JSON.stringify(draft));
  } catch { /* noop */ }
}

/**
 * One-question-per-screen report flow. Used for
 *  - "vehicle not found" (closes the service as unavailable), and
 *  - "very dirty / needs attention" (evidence first, then the partner
 *    decides whether cleaning is still possible).
 *
 * Backend behaviour is unchanged: same `submit_service_unavailable` RPC,
 * same photo stages, same compensation.
 */
export function GuidedReport({
  serviceId,
  assignmentId,
  kind,
  title,
  reasons,
  angles,
  photos,
  refetch,
  compensation,
  onSubmitted,
  onBack,
  onContinueAnyway,
  continueLabel,
}: {
  serviceId: string;
  assignmentId?: string | null;
  kind: "unavailable" | "dirty";
  title: string;
  reasons: ReportReason[];
  angles: readonly string[];
  photos: ServicePhotoRow[];
  refetch: () => void;
  compensation: number;
  onSubmitted: () => void;
  onBack: () => void;
  onContinueAnyway?: () => void;
  continueLabel?: string;
}) {
  const initial = useRef(readDraft(serviceId, kind));
  const [reason, setReason] = useState(initial.current.reason);
  const [notes, setNotes] = useState(initial.current.notes);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<"reason" | "photos" | "finish">(initial.current.reason ? "photos" : "reason");
  const inFlight = useRef(false);
  const qc = useQueryClient();

  const capturedPaths = pickPhotoPaths(photos, kind, angles);
  const nextAngleIdx = angles.findIndex((a) => !photos.some((p) => p.stage === kind && p.angle === a));
  const allPhotosDone = nextAngleIdx === -1;
  const needsRemarks = reason === "other" || reason === "Other";

  useEffect(() => { writeDraft(serviceId, kind, { reason, notes }); }, [serviceId, kind, reason, notes]);
  useEffect(() => { if (allPhotosDone && stage === "photos") setStage("finish"); }, [allPhotosDone, stage]);

  const submit = async () => {
    if (inFlight.current) return;
    if (!reason) return toast.error("Please choose a reason");
    if (capturedPaths.length < angles.length) return toast.error("Please take all the photos first");
    if (needsRemarks && !notes.trim()) return toast.error("Please write what happened");
    inFlight.current = true;
    setSaving(true);
    let pos: { lat: number; lng: number } | null = null;
    try {
      pos = await getPosition();
      console.log(`[UNAVAILABLE-E2E:01] PARTNER_UNAVAILABLE_ACTION service_id=${serviceId} kind=${kind} reason=${reason}`);
      const rpcReason = kind === "dirty" ? "dirty_vehicle" : reason;
      const label = reasons.find((r) => r.value === reason)?.label ?? reason;
      const rpcNotes = kind === "dirty" ? `${label}${notes ? ` · ${notes}` : ""}` : notes || "";
      const { data, error } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: serviceId,
        p_reason: rpcReason,
        p_notes: rpcNotes,
        p_photos: capturedPaths,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (error) {
        console.error(`[CUSTOMER-E2E:COMPLETE:ERR] RPC_ERROR (unavailable)`, error);
        throw error;
      }
      console.log(`[CUSTOMER-E2E:02-COMPLETE] SERVICE_RPC_SUCCESS service_id=${serviceId} status=unavailable`);
      
      const r: any = data ?? {};
      console.log(`[CUSTOMER-E2E:03-CUSTOMER] CUSTOMER_RESOLVED (unavailable) customer_id=${r.customer_id} notification_id=${r.notification_id}`);
      toast.success(`Reported · ₹${Number(r.credit_amount ?? compensation)} credited`);
      
      console.log("[CUSTOMER-E2E:06-FLUSH] FLUSH_STARTED (Direct Completion Path - Unavailable)");
      import("@/lib/push/immediate.functions").then(m => {
        // Direct Send (Proven Path)
        m.sendDirectCompletionPush({
          data: {
            customerId: r.customer_id,
            serviceId,
            type: kind === "dirty" ? "vehicle_dirty" : "vehicle_unavailable",
            title: kind === "dirty" ? "Vehicle needs attention" : "Service update",
            body: kind === "dirty" 
              ? "Your vehicle requires attention. View details in My Plan."
              : "We couldn't complete your service today. View details in My Plan."
          }
        }).then(res => {
          console.log(`[CUSTOMER-COMPLETE-PUSH:05] DIRECT_SEND_FINISHED (unavailable) result:`, res);
        }).catch(e => console.error("[CUSTOMER-COMPLETE-PUSH:ERR] direct send failed", e));

        // Background queue flush
        m.flushNotificationPush().catch(e => console.error("[CUSTOMER-E2E:07-FLUSH:ERR] flush failed", e));
      });
      qc.setQueryData(["service", serviceId], (current: any) =>
        current ? { ...current, status: "unavailable", unavailable_reason: rpcReason, unavailable_notes: rpcNotes } : current,
      );
      writeDraft(serviceId, kind, { reason: "", notes: "" });
      onSubmitted();
    } catch (error: any) {
      
      toast.error(error?.message ?? "Could not send the report");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const angleLabel = (a: string) => ({ front: "Front", rear: "Back", left: "Left side", right: "Right side" } as Record<string, string>)[a] ?? a;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {stage === "reason" && (
        <>
          <h2 className="text-2xl font-bold leading-tight">{title}</h2>
          <div className="space-y-3">
            {reasons.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => { setReason(r.value); setStage("photos"); }}
                className="flex min-h-[64px] w-full items-center justify-between rounded-2xl border-2 border-border bg-card px-5 text-left text-lg font-semibold transition active:scale-[0.99]"
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {stage === "photos" && (
        <>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Photo {Math.min(capturedPaths.length + 1, angles.length)} of {angles.length}
          </p>
          <h2 className="text-2xl font-bold leading-tight">
            Take {angleLabel(angles[nextAngleIdx === -1 ? angles.length - 1 : nextAngleIdx]).toLowerCase()} photo
          </h2>
          <PhotoSlot
            key={angles[nextAngleIdx === -1 ? angles.length - 1 : nextAngleIdx]}
            serviceId={serviceId}
            assignmentId={assignmentId}
            workflow={kind === "dirty" ? "dirty_vehicle" : "unavailable_vehicle"}
            stage={kind}
            angle={angles[nextAngleIdx === -1 ? angles.length - 1 : nextAngleIdx]}
            slotId={`${kind}_${angles[nextAngleIdx === -1 ? angles.length - 1 : nextAngleIdx]}`}
            done={false}
            label={angleLabel(angles[nextAngleIdx === -1 ? angles.length - 1 : nextAngleIdx])}
            variant="hero"
            hint="Hold the phone steady"
            onUploaded={() => refetch()}
            disabled={saving}
          />
          <div className="flex items-center gap-2">
            {angles.map((a) => (
              <span
                key={a}
                className={`h-2 flex-1 rounded-full ${photos.some((p) => p.stage === kind && p.angle === a) ? "bg-[color:var(--success)]" : "bg-muted"}`}
              />
            ))}
          </div>
        </>
      )}

      {stage === "finish" && (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 p-4">
            <Check className="h-5 w-5 text-[color:var(--success)]" />
            <p className="text-sm font-semibold">All {angles.length} photos saved</p>
          </div>
          <h2 className="text-2xl font-bold leading-tight">
            {needsRemarks ? "What happened?" : "Anything to add?"}
          </h2>
          <Textarea
            placeholder={needsRemarks ? "Write what happened (required)" : "Optional note"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[96px] rounded-2xl text-base"
          />
          {onContinueAnyway && (
            <Button
              size="lg"
              className="h-14 w-full text-base font-semibold"
              onClick={onContinueAnyway}
              disabled={saving}
            >
              {continueLabel ?? "I can still clean it"}
            </Button>
          )}
          <Button
            size="lg"
            variant={onContinueAnyway ? "outline" : "default"}
            className="h-14 w-full text-base font-semibold"
            onClick={submit}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {onContinueAnyway ? `I cannot clean it · ₹${compensation}` : `Send report · ₹${compensation}`}
          </Button>
        </>
      )}
    </div>
  );
}
