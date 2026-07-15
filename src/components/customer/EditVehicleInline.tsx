import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Cropper, { type Area } from "react-easy-crop";
import {
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

export type EditableVehicle = {
  id: string;
  make: string;
  model: string;
  registration_number: string;
  color: string | null;
  nickname?: string | null;
  parking_notes?: string | null;
  is_default?: boolean | null;
  image_path?: string | null;
};

/* ------------------------------------------------------------------ */
/* Edit vehicle — inline dialog with zod validation + retry            */
/* ------------------------------------------------------------------ */

// Indian plate format: XX00XX0000 (state + district + series + number).
const PLATE_RE = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$/;

const editSchema = z.object({
  registration_number: z
    .string()
    .trim()
    .min(1, "Registration is required")
    .max(16, "Registration is too long")
    .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
    .refine((s) => PLATE_RE.test(s), "Use format like UP32TE1002"),
  nickname: z.string().trim().max(40, "Keep it under 40 characters").optional().or(z.literal("")),
  color: z
    .string()
    .trim()
    .max(20, "Keep it under 20 characters")
    .regex(/^[A-Za-z\s-]*$/i, "Letters only")
    .optional()
    .or(z.literal("")),
  parking_notes: z.string().trim().max(300, "Keep it under 300 characters").optional().or(z.literal("")),
  is_default: z.boolean(),
});

type EditForm = z.infer<typeof editSchema>;
type FieldErrors = Partial<Record<keyof EditForm, string>>;

export function EditVehicleDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: EditableVehicle | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<EditForm>({
    registration_number: "",
    nickname: "",
    color: "",
    parking_notes: "",
    is_default: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  const draftKey = vehicle ? `uw:edit-veh-draft:${vehicle.id}` : null;

  // On open: restore any unsaved draft from sessionStorage; otherwise seed
  // from the vehicle. Drafts survive dialog close/reopen so a slip of the
  // finger on Cancel doesn't wipe minutes of typing.
  useEffect(() => {
    if (!vehicle || !open) return;
    let restored = false;
    if (draftKey) {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw) as EditForm;
          setForm({
            registration_number: parsed.registration_number ?? "",
            nickname: parsed.nickname ?? "",
            color: parsed.color ?? "",
            parking_notes: parsed.parking_notes ?? "",
            is_default: !!parsed.is_default,
          });
          setDirty(true);
          restored = true;
        }
      } catch { /* ignore corrupt draft */ }
    }
    if (!restored) {
      setForm({
        registration_number: vehicle.registration_number ?? "",
        nickname: vehicle.nickname ?? "",
        color: vehicle.color ?? "",
        parking_notes: vehicle.parking_notes ?? "",
        is_default: !!vehicle.is_default,
      });
      setDirty(false);
    }
    setRestoredDraft(restored);
    setErrors({});
    setSaveError(null);
  }, [vehicle?.id, open]);

  // Persist the working draft while the dialog is open and dirty.
  useEffect(() => {
    if (!open || !dirty || !draftKey) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify(form)); } catch { /* quota */ }
  }, [form, dirty, open, draftKey]);

  const clearDraft = () => { if (draftKey) { try { sessionStorage.removeItem(draftKey); } catch { /* noop */ } } };

  const setField = <K extends keyof EditForm>(key: K, val: EditForm[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    setRestoredDraft(false);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (saveError) setSaveError(null);
  };

  const save = useMutation({
    mutationFn: async (parsed: EditForm) => {
      if (!vehicle) return;
      const patch: Record<string, unknown> = {
        registration_number: parsed.registration_number,
        nickname: (parsed.nickname ?? "").trim() || null,
        color: (parsed.color ?? "").trim() || null,
        parking_notes: (parsed.parking_notes ?? "").trim() || null,
        is_default: parsed.is_default,
      };
      const { error } = await (supabase as any)
        .from("customer_vehicles")
        .update(patch)
        .eq("id", vehicle.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle updated");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", vehicle?.id] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
      qc.invalidateQueries({ queryKey: ["vehicle-catalog-image"] });
      qc.invalidateQueries({ queryKey: ["home-vehicle"] });
      try {
        window.dispatchEvent(new CustomEvent("uw:vehicle-updated", { detail: { id: vehicle?.id } }));
      } catch { /* noop */ }
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setSaveError(e instanceof Error ? e.message : "Could not save. Check your connection and retry.");
    },
  });

  const handleSave = () => {
    const result = editSchema.safeParse(form);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const k = issue.path[0] as keyof EditForm;
        if (!next[k]) next[k] = issue.message;
      }
      setErrors(next);
      queueMicrotask(() => {
        const firstKey = Object.keys(next)[0];
        if (firstKey) {
          const el = document.getElementById(`edit-veh-${firstKey}`);
          el?.focus();
        }
      });
      return;
    }
    save.mutate(result.data);
  };

  // Close without confirm(): unsaved edits are saved as a draft and
  // restored the next time the dialog opens. An explicit "Discard draft"
  // button gives the user an escape hatch.
  const attemptClose = (nextOpen: boolean) => {
    if (save.isPending) return;
    onOpenChange(nextOpen);
  };

  const discardDraft = () => {
    if (!vehicle) return;
    clearDraft();
    setForm({
      registration_number: vehicle.registration_number ?? "",
      nickname: vehicle.nickname ?? "",
      color: vehicle.color ?? "",
      parking_notes: vehicle.parking_notes ?? "",
      is_default: !!vehicle.is_default,
    });
    setDirty(false);
    setRestoredDraft(false);
    setErrors({});
    setSaveError(null);
  };

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={attemptClose}>
      <DialogContent className="max-w-md" aria-describedby="edit-veh-desc">
        <DialogHeader>
          <DialogTitle>Edit {vehicle.make} {vehicle.model}</DialogTitle>
          <DialogDescription id="edit-veh-desc">
            Update registration, nickname, colour and parking notes. Press Escape to cancel.
          </DialogDescription>
        </DialogHeader>

        {restoredDraft && (
          <div
            role="status"
            data-testid="restored-draft-banner"
            className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-primary"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="font-medium">Unsaved changes restored</p>
              <p className="mt-0.5 opacity-90">We kept your edits from last time.</p>
            </div>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2 hover:opacity-80"
              onClick={discardDraft}
              data-testid="discard-draft"
            >
              Discard
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          className="space-y-4"
          noValidate
        >
          <Field id="edit-veh-registration_number" label="Registration" error={errors.registration_number} required>
            <Input
              id="edit-veh-registration_number"
              value={form.registration_number}
              onChange={(e) => setField("registration_number", e.target.value.toUpperCase())}
              placeholder="UP32TE1002"
              className="mt-1.5 uppercase tracking-wider"
              maxLength={16}
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={!!errors.registration_number}
              aria-describedby={errors.registration_number ? "err-registration_number" : undefined}
              aria-required
            />
          </Field>

          <Field id="edit-veh-nickname" label="Nickname" error={errors.nickname}>
            <Input
              id="edit-veh-nickname"
              value={form.nickname ?? ""}
              onChange={(e) => setField("nickname", e.target.value)}
              placeholder="Family car, Office car…"
              className="mt-1.5"
              maxLength={40}
              aria-invalid={!!errors.nickname}
              aria-describedby={errors.nickname ? "err-nickname" : undefined}
            />
          </Field>

          <Field id="edit-veh-color" label="Colour" error={errors.color}>
            <Input
              id="edit-veh-color"
              value={form.color ?? ""}
              onChange={(e) => setField("color", e.target.value)}
              placeholder="White"
              className="mt-1.5"
              maxLength={20}
              aria-invalid={!!errors.color}
              aria-describedby={errors.color ? "err-color" : undefined}
            />
          </Field>

          <Field id="edit-veh-parking_notes" label="Parking instructions" error={errors.parking_notes}>
            <Textarea
              id="edit-veh-parking_notes"
              value={form.parking_notes ?? ""}
              onChange={(e) => setField("parking_notes", e.target.value)}
              placeholder="B-block basement, slot 14. Ask guard for key."
              className="mt-1.5"
              rows={3}
              maxLength={300}
              aria-invalid={!!errors.parking_notes}
              aria-describedby={errors.parking_notes ? "err-parking_notes" : undefined}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {(form.parking_notes ?? "").length}/300
            </p>
          </Field>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.is_default}
              onChange={(e) => setField("is_default", e.target.checked)}
              disabled={save.isPending}
              aria-label="Set as default vehicle"
            />
            <Star className="h-4 w-4 text-primary" aria-hidden />
            <span>Set as default vehicle</span>
          </label>

          {saveError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">Couldn't save changes</p>
                <p className="mt-0.5 opacity-90">{saveError}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => attemptClose(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || (!dirty && !saveError)}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {saveError ? "Retry save" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
      </Label>
      {children}
      {error && (
        <p id={`err-${id.replace("edit-veh-", "")}`} role="alert" className="mt-1 text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Change photo — chooser + crop + preview + upload                    */
/* ------------------------------------------------------------------ */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const OUTPUT_EDGE_PX = 1200; // final saved size
const OUTPUT_MIME = "image/jpeg";
const OUTPUT_QUALITY = 0.85;
const CROP_ASPECT = 4 / 3; // matches vehicle avatar frames on Home

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image"));
    img.src = url;
  });
}

/** Crop the picked image at the user-selected area, then encode. */
async function cropAndEncode(sourceUrl: string, area: Area): Promise<{ blob: Blob; previewUrl: string }> {
  const img = await loadImage(sourceUrl);
  // Target size preserves 4:3 aspect within OUTPUT_EDGE_PX.
  const targetW = OUTPUT_EDGE_PX;
  const targetH = Math.round(OUTPUT_EDGE_PX / CROP_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, targetW, targetH);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Could not encode image"))),
      OUTPUT_MIME,
      OUTPUT_QUALITY,
    ),
  );
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

type Stage = "choose" | "crop" | "preview";

export function ChangePhotoDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: EditableVehicle | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("choose");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [chooserError, setChooserError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Upload progress + cancel state
  const [uploadProgress, setUploadProgress] = useState(0); // 0..1
  const [uploadStalled, setUploadStalled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stalledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const cleanupUrls = useCallback(() => {
    setSourceUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setProcessedBlob(null);
  }, []);

  const resetAll = useCallback(() => {
    cleanupUrls();
    setStage("choose");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setChooserError(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStalled(false);
  }, [cleanupUrls]);

  useEffect(() => {
    if (!open) resetAll();
  }, [open, resetAll]);
  useEffect(() => () => cleanupUrls(), [cleanupUrls]);

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    setChooserError(null);
    if (!f.type.startsWith("image/")) {
      setChooserError("Please choose an image file (JPG or PNG).");
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setChooserError("Image is too large. Please pick one under 8 MB.");
      return;
    }
    setProcessing(true);
    try {
      cleanupUrls();
      const url = URL.createObjectURL(f);
      setSourceUrl(url);
      setStage("crop");
    } catch (e) {
      setChooserError(e instanceof Error ? e.message : "Could not read image");
    } finally {
      setProcessing(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  const applyCrop = async () => {
    if (!sourceUrl || !croppedArea) return;
    setProcessing(true);
    try {
      const { blob, previewUrl: pv } = await cropAndEncode(sourceUrl, croppedArea);
      setProcessedBlob(blob);
      setPreviewUrl(pv);
      setStage("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not crop image");
    } finally {
      setProcessing(false);
    }
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error("No vehicle selected");
      if (!processedBlob) throw new Error("Choose a photo first");
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      const userId = sess.session?.user?.id;
      if (!accessToken || !userId) throw new Error("You're signed out — sign in again to save the photo");

      const path = `${userId}/${vehicle.id}/${Date.now()}.jpg`;
      const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const endpoint = `${supaUrl}/storage/v1/object/vehicle-images/${path}`;

      // Reset progress + arm stalled-detector.
      setUploadProgress(0);
      setUploadStalled(false);
      const controller = new AbortController();
      abortRef.current = controller;
      const armStalledTimer = () => {
        if (stalledTimerRef.current) clearTimeout(stalledTimerRef.current);
        stalledTimerRef.current = setTimeout(() => setUploadStalled(true), 20_000);
      };
      armStalledTimer();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.setRequestHeader("apikey", publishable);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.setRequestHeader("Content-Type", OUTPUT_MIME);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(e.loaded / e.total);
          setUploadStalled(false);
          armStalledTimer();
        };
        xhr.onload = () => {
          if (stalledTimerRef.current) clearTimeout(stalledTimerRef.current);
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(1);
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => {
          const err = new Error("Upload cancelled");
          (err as any).name = "AbortError";
          reject(err);
        };
        controller.signal.addEventListener("abort", () => xhr.abort());
        xhr.send(processedBlob);
      });

      const previous = vehicle.image_path;
      const { error: dbErr } = await (supabase as any)
        .from("customer_vehicles")
        .update({ image_path: path })
        .eq("id", vehicle.id);
      if (dbErr) {
        await supabase.storage.from("vehicle-images").remove([path]);
        throw dbErr;
      }
      if (previous && previous !== path) {
        await supabase.storage.from("vehicle-images").remove([previous]);
      }
      return path;
    },
    onSuccess: () => {
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", vehicle?.id] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
      qc.invalidateQueries({ queryKey: ["vehicle-catalog-image"] });
      try {
        window.dispatchEvent(new CustomEvent("uw:vehicle-updated", { detail: { id: vehicle?.id } }));
      } catch { /* noop */ }
      resetAll();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      // Keep the crop/preview so the user can retry without re-picking.
      const isAbort = e instanceof Error && (e.name === "AbortError" || /cancelled/i.test(e.message));
      setUploadError(isAbort ? "Upload cancelled. You can try again anytime." : (e instanceof Error ? e.message : "Upload failed. Check your connection and retry."));
    },
    onSettled: () => {
      abortRef.current = null;
      if (stalledTimerRef.current) { clearTimeout(stalledTimerRef.current); stalledTimerRef.current = null; }
      setUploadStalled(false);
    },
  });

  const cancelUpload = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const remove = useMutation({
    mutationFn: async () => {
      if (!vehicle) return;
      const previous = vehicle.image_path;
      const { error } = await (supabase as any)
        .from("customer_vehicles")
        .update({ image_path: null })
        .eq("id", vehicle.id);
      if (error) throw error;
      if (previous) await supabase.storage.from("vehicle-images").remove([previous]);
    },
    onSuccess: () => {
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", vehicle?.id] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
      qc.invalidateQueries({ queryKey: ["vehicle-catalog-image"] });
      try {
        window.dispatchEvent(new CustomEvent("uw:vehicle-updated", { detail: { id: vehicle?.id } }));
      } catch { /* noop */ }
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const busy = processing || upload.isPending || remove.isPending;
  const hasCustomPhoto = !!vehicle?.image_path;

  const guardedClose = (v: boolean) => {
    if (busy) return;
    if (!v && (stage !== "choose")) {
      if (!confirm("Discard this photo?")) return;
    }
    onOpenChange(v);
  };

  const title =
    stage === "preview" ? "Confirm photo" :
    stage === "crop" ? "Crop photo" :
    "Change photo";

  return (
    <Dialog open={open} onOpenChange={guardedClose}>
      <DialogContent className="max-w-sm" aria-describedby="change-photo-desc">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="change-photo-desc">
            {stage === "choose" && "Take a new photo or upload one from your gallery."}
            {stage === "crop" && "Drag to reposition and use the slider to zoom. The 4:3 frame is what will be saved."}
            {stage === "preview" && "Preview the cropped photo before saving."}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-hidden
          tabIndex={-1}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-hidden
          tabIndex={-1}
        />

        {stage === "choose" && (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              autoFocus
            >
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Camera className="mr-2 h-4 w-4" aria-hidden />}
              Take photo
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="mr-2 h-4 w-4" aria-hidden /> Upload from gallery
            </Button>
            {hasCustomPhoto && (
              <Button
                size="lg"
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive"
                disabled={busy}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                )}
                Remove photo
              </Button>
            )}
            {chooserError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{chooserError}</p>
              </div>
            )}
          </div>
        )}

        {stage === "crop" && sourceUrl && (
          <div className="space-y-3">
            <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-border bg-black">
              <Cropper
                image={sourceUrl}
                crop={crop}
                zoom={zoom}
                aspect={CROP_ASPECT}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_a, areaPx) => setCroppedArea(areaPx)}
              />
            </div>
            <div>
              <Label htmlFor="crop-zoom" className="text-xs">Zoom</Label>
              <Slider
                id="crop-zoom"
                min={1}
                max={3}
                step={0.01}
                value={[zoom]}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
                aria-label="Zoom level"
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="lg" disabled={busy} onClick={resetAll}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Start over
              </Button>
              <Button size="lg" disabled={busy || !croppedArea} onClick={applyCrop}>
                {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Next
              </Button>
            </div>
          </div>
        )}

        {stage === "preview" && previewUrl && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-muted">
              <img
                data-testid="photo-preview-image"
                src={previewUrl}
                alt={`Preview of new photo for ${vehicle?.make ?? ""} ${vehicle?.model ?? ""}`.trim()}
                className="mx-auto block max-h-72 w-full object-cover"
              />
            </div>

            {upload.isPending && (
              <div
                role="status"
                aria-live="polite"
                aria-label={`Uploading photo, ${Math.round(uploadProgress * 100)} percent`}
                data-testid="upload-progress"
                className="space-y-2 rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Uploading photo…</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(uploadProgress * 100)}%
                  </span>
                </div>
                <Progress value={Math.round(uploadProgress * 100)} aria-hidden />
                {uploadStalled && (
                  <p className="text-[11px] text-amber-600">
                    Upload seems slow. You can wait or cancel and retry.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={cancelUpload}
                  data-testid="cancel-upload"
                >
                  <X className="mr-2 h-3.5 w-3.5" aria-hidden /> Cancel upload
                </Button>
              </div>
            )}

            {uploadError && !upload.isPending && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium">Couldn't upload photo</p>
                  <p className="mt-0.5 opacity-90">{uploadError}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={() => { setStage("crop"); setUploadError(null); }}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Re-crop
              </Button>
              <Button
                size="lg"
                disabled={busy || !processedBlob}
                onClick={() => { setUploadError(null); upload.mutate(); }}
              >
                {upload.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                )}
                {upload.isPending
                  ? `Uploading ${Math.round(uploadProgress * 100)}%`
                  : uploadError
                    ? "Retry upload"
                    : "Use photo"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
