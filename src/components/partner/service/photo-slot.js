import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CAMERA_UNAVAILABLE_MESSAGE, captureFromCamera, consumeRestoredCameraCapture } from "@/lib/camera";
import { getCurrentGps } from "@/lib/native";
import { deleteQueuedPhoto, loadQueuedPhoto, saveQueuedPhoto } from "@/lib/photo-upload-queue";
export async function getPosition() {
    return getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
export function pickPhotoPaths(photos, stage, angles) {
    return angles
        .map((a) => photos.find((p) => p.stage === stage && p.angle === a)?.storage_path)
        .filter((p) => Boolean(p));
}
export function workflowEventName(workflow, phase) {
    if (workflow === "service_photo")
        return `service_photo_${phase}`;
    if (workflow === "dirty_vehicle")
        return `dirty_${phase}`;
    return `unavailable_${phase}`;
}
export function useServicePhotoSignedUrl(path) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        if (!path) {
            setUrl(null);
            return;
        }
        supabase.storage.from("service-photos").createSignedUrl(path, 60 * 60).then(({ data }) => {
            if (!cancelled)
                setUrl(data?.signedUrl ?? null);
        });
        return () => { cancelled = true; };
    }, [path]);
    return url;
}
/**
 * Unified camera + upload pipeline. Identical for Before, After,
 * Unavailable and Dirty captures — only the `stage` written to
 * `service_photos` differs. No backend behaviour is changed here.
 */
export function PhotoSlot({ serviceId, assignmentId, workflow = "service_photo", stage, angle, slotId, done, onUploaded, onLocalCaptured, initialPath, label, wide, autoOpen, onAutoOpenConsumed, disabled, variant = "default", stepNumber, thumbPath, hint, }) {
    const [uploading, setUploading] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const thumbUrl = useServicePhotoSignedUrl(variant === "guided-done" ? thumbPath : null);
    const [queuedPath, setQueuedPath] = useState(() => {
        if (typeof window === "undefined")
            return null;
        try {
            return window.localStorage.getItem(`uw_photo_path:${serviceId}:${slotId ?? `${stage}_${angle}`}`);
        }
        catch {
            return null;
        }
    });
    const retryingRef = useRef(false);
    const slot = slotId ?? `${stage}_${angle}`;
    const queueKey = `${serviceId}:${slot}`;
    const pathKey = `uw_photo_path:${serviceId}:${slot}`;
    const busy = capturing || uploading;
    const visuallyDone = done || Boolean(initialPath) || Boolean(queuedPath);
    const tag = workflow === "unavailable_vehicle"
        ? "[SVC][UNAVAILABLE]"
        : workflow === "dirty_vehicle"
            ? "[SVC][DIRTY]"
            : "[SVC][PHOTO]";
    const errTag = `${tag}[ERROR]`;
    const uploadCapturedFile = async (file, startedAt = Date.now(), existingPath) => {
        if (retryingRef.current)
            return;
        retryingRef.current = true;
        setUploading(true);
        let path = existingPath ?? queuedPath;
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            let userId = sessionData.session?.user.id ?? null;
            if (!userId) {
                const { data: u } = await supabase.auth.getUser();
                userId = u.user?.id ?? null;
            }
            if (!userId)
                throw new Error("Please sign in again");
            path = path || `${userId}/${serviceId}/${stage}-${angle}-${Date.now()}.jpg`;
            setQueuedPath(path);
            try {
                window.localStorage.setItem(pathKey, path);
            }
            catch { /* keep going */ }
            onLocalCaptured?.(path);
            await saveQueuedPhoto(queueKey, file);
            const pos = await getPosition();
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt += 1) {
                try {
                    if (typeof navigator !== "undefined" && navigator.onLine === false)
                        throw new Error("Offline");
                    const { error } = await supabase.storage
                        .from("service-photos")
                        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
                    if (error)
                        throw error;
                    const { error: e2 } = await supabase
                        .from("service_photos")
                        .upsert({
                        service_id: serviceId,
                        partner_id: userId,
                        stage: stage,
                        angle: angle,
                        storage_path: path,
                        lat: pos?.lat ?? null,
                        lng: pos?.lng ?? null,
                    }, { onConflict: "service_id,stage,angle" });
                    if (e2)
                        throw e2;
                    lastError = null;
                    break;
                }
                catch (attemptError) {
                    lastError = attemptError;
                    if (attempt < 3)
                        await new Promise((resolve) => window.setTimeout(resolve, attempt * 700));
                }
            }
            if (lastError)
                throw lastError;
            await deleteQueuedPhoto(queueKey);
            try {
                window.localStorage.removeItem(pathKey);
            }
            catch { /* noop */ }
            setQueuedPath(null);
            onUploaded(path);
            if (workflow === "service_photo")
                toast.success(`✓ ${label} saved`, { duration: 1100 });
        }
        catch (err) {
            console.error(`${errTag} Upload failed · slot=${slot} · ${err?.message ?? err}`);
            toast.error(typeof navigator !== "undefined" && navigator.onLine === false ? "Photo saved offline. It will retry automatically." : (err?.message ?? "Photo saved locally. Upload will retry."));
        }
        finally {
            setUploading(false);
            retryingRef.current = false;
        }
    };
    const openCamera = async () => {
        if (disabled || busy)
            return;
        const t0 = Date.now();
        setCapturing(true);
        let file = null;
        try {
            file = await captureFromCamera({ serviceId, assignmentId, workflow, stage: stage === "unavailable" || stage === "dirty" ? "report" : stage, angle, slot });
        }
        catch (err) {
            console.error(`${errTag} Camera failed · slot=${slot} · ${err?.message ?? err}`);
            toast.error(CAMERA_UNAVAILABLE_MESSAGE);
            return;
        }
        finally {
            setCapturing(false);
        }
        if (!file) {
            toast.error(CAMERA_UNAVAILABLE_MESSAGE);
            return;
        }
        await uploadCapturedFile(file, t0);
    };
    useEffect(() => {
        if (done) {
            void deleteQueuedPhoto(queueKey);
            try {
                window.localStorage.removeItem(pathKey);
            }
            catch { /* noop */ }
            setQueuedPath(null);
            return;
        }
        let cancelled = false;
        const retryQueued = async () => {
            if (cancelled || retryingRef.current)
                return;
            let path = queuedPath;
            if (!path) {
                try {
                    path = window.localStorage.getItem(pathKey);
                }
                catch {
                    path = null;
                }
            }
            if (!path)
                return;
            const file = await loadQueuedPhoto(queueKey);
            if (cancelled || !file)
                return;
            await uploadCapturedFile(file, Date.now(), path);
        };
        void retryQueued();
        window.addEventListener("online", retryQueued);
        return () => {
            cancelled = true;
            window.removeEventListener("online", retryQueued);
        };
    }, [done, queueKey, pathKey, queuedPath]);
    useEffect(() => {
        if (done || busy)
            return;
        let cancelled = false;
        void (async () => {
            const restored = await consumeRestoredCameraCapture({ slot });
            if (cancelled || !restored)
                return;
            void uploadCapturedFile(restored);
        })();
        return () => { cancelled = true; };
    }, [done, busy, slot, workflow, serviceId, assignmentId, stage, angle]);
    useEffect(() => {
        if (!autoOpen || done || busy)
            return;
        onAutoOpenConsumed?.();
        const timer = window.setTimeout(() => void openCamera(), 250);
        return () => window.clearTimeout(timer);
    }, [autoOpen, done, busy]);
    // Full-bleed single-question capture card used by the guided flow.
    if (variant === "hero") {
        return (<button type="button" onClick={openCamera} disabled={disabled || busy} className="flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary/50 bg-primary/5 px-5 py-12 text-center transition active:scale-[0.99] disabled:opacity-70">
        <span className="grid h-24 w-24 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
          {busy ? <Loader2 className="h-10 w-10 animate-spin"/> : <Camera className="h-10 w-10"/>}
        </span>
        <span className="text-xl font-bold">{busy ? "Saving…" : `Open camera`}</span>
        {hint && !busy && <span className="text-sm text-muted-foreground">{hint}</span>}
      </button>);
    }
    if (variant === "guided-done") {
        return (<button type="button" onClick={openCamera} disabled={disabled || busy} className="group flex w-full items-center gap-3 rounded-2xl border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 p-2.5 pr-4 text-left transition hover:bg-[color:var(--success)]/15">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/5">
          {thumbUrl ? (<img src={thumbUrl} alt={label} className="h-full w-full object-cover"/>) : (<div className="flex h-full w-full items-center justify-center"><Camera className="h-5 w-5 text-muted-foreground"/></div>)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold capitalize text-[color:var(--success)]">{label}</p>
          <p className="text-[11px] text-muted-foreground">Tap to take again</p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-[color:var(--success)]"/>}
      </button>);
    }
    if (variant === "guided-active") {
        return (<button type="button" onClick={openCamera} disabled={disabled || busy} className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-primary bg-primary/5 px-4 py-8 text-center transition active:scale-[0.99] disabled:opacity-70">
        {stepNumber != null && (<span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-md">
            {stepNumber}
          </span>)}
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
          {busy ? <Loader2 className="h-7 w-7 animate-spin"/> : <Camera className="h-7 w-7"/>}
        </div>
        <p className="mt-1 text-base font-bold capitalize">{busy ? "Saving…" : `Take ${label} photo`}</p>
        {hint && !busy && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </button>);
    }
    if (variant === "guided-locked") {
        return (<div className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-3 py-2.5 opacity-70">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground">
          {stepNumber ?? "•"}
        </span>
        <p className="text-sm font-medium capitalize text-muted-foreground">{label}</p>
      </div>);
    }
    return (<button onClick={openCamera} disabled={disabled || busy} className={`flex ${wide ? "aspect-[3/1]" : "aspect-square"} flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs font-medium capitalize transition ${visuallyDone
            ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]"
            : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin"/> : visuallyDone ? <Check className="h-5 w-5"/> : <Camera className="h-5 w-5"/>}
      {busy ? "Saving…" : visuallyDone ? "✓ Captured" : label}
    </button>);
}
