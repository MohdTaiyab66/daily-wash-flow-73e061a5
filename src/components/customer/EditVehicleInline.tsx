import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Image as ImageIcon, Loader2, RotateCcw, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
/* Edit vehicle — inline dialog with zod validation                    */
/* ------------------------------------------------------------------ */

// Indian plate format: XX00XX0000 (state + district + series + number).
// Accept 1-2 digit district and 0-3 letter series to cover BH/temp series.
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
  const [dirty, setDirty] = useState(false);

  // Reset when the dialog opens for a new vehicle.
  useEffect(() => {
    if (!vehicle || !open) return;
    setForm({
      registration_number: vehicle.registration_number ?? "",
      nickname: vehicle.nickname ?? "",
      color: vehicle.color ?? "",
      parking_notes: vehicle.parking_notes ?? "",
      is_default: !!vehicle.is_default,
    });
    setErrors({});
    setDirty(false);
  }, [vehicle?.id, open]);

  const setField = <K extends keyof EditForm>(key: K, val: EditForm[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
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
      // Refresh everything that depends on customer vehicles.
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", vehicle?.id] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
      qc.invalidateQueries({ queryKey: ["vehicle-catalog-image"] });
      qc.invalidateQueries({ queryKey: ["home-vehicle"] });
      // Fan-out signal for any listeners (realtime consumers, other tabs).
      try {
        window.dispatchEvent(new CustomEvent("uw:vehicle-updated", { detail: { id: vehicle?.id } }));
      } catch { /* noop */ }
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
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
      return;
    }
    save.mutate(result.data);
  };

  const attemptClose = (nextOpen: boolean) => {
    if (save.isPending) return;
    if (!nextOpen && dirty) {
      if (!confirm("Discard unsaved changes?")) return;
    }
    onOpenChange(nextOpen);
  };

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={attemptClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {vehicle.make} {vehicle.model}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Registration" error={errors.registration_number} required>
            <Input
              value={form.registration_number}
              onChange={(e) => setField("registration_number", e.target.value.toUpperCase())}
              placeholder="UP32TE1002"
              className="mt-1.5 uppercase tracking-wider"
              maxLength={16}
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={!!errors.registration_number}
            />
          </Field>

          <Field label="Nickname" error={errors.nickname}>
            <Input
              value={form.nickname ?? ""}
              onChange={(e) => setField("nickname", e.target.value)}
              placeholder="Family car, Office car…"
              className="mt-1.5"
              maxLength={40}
              aria-invalid={!!errors.nickname}
            />
          </Field>

          <Field label="Colour" error={errors.color}>
            <Input
              value={form.color ?? ""}
              onChange={(e) => setField("color", e.target.value)}
              placeholder="White"
              className="mt-1.5"
              maxLength={20}
              aria-invalid={!!errors.color}
            />
          </Field>

          <Field label="Parking instructions" error={errors.parking_notes}>
            <Textarea
              value={form.parking_notes ?? ""}
              onChange={(e) => setField("parking_notes", e.target.value)}
              placeholder="B-block basement, slot 14. Ask guard for key."
              className="mt-1.5"
              rows={3}
              maxLength={300}
              aria-invalid={!!errors.parking_notes}
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
            />
            <Star className="h-4 w-4 text-primary" />
            <span>Set as default vehicle</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => attemptClose(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={save.isPending || !dirty}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Change photo — chooser + preview + downscaled upload                */
/* ------------------------------------------------------------------ */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_EDGE_PX = 1600;
const OUTPUT_MIME = "image/jpeg";
const OUTPUT_QUALITY = 0.85;

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image"));
    img.src = url;
  });
}

/**
 * Downscales the picked image on a canvas so we don't upload 12 MP originals.
 * Preserves aspect ratio, longest edge = MAX_EDGE_PX, re-encodes to JPEG.
 */
async function processImage(file: File): Promise<{ blob: Blob; previewUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image is too large (max 8 MB)");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > MAX_EDGE_PX ? MAX_EDGE_PX / longest : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("Could not encode image"))),
        OUTPUT_MIME,
        OUTPUT_QUALITY,
      ),
    );
    return { blob, previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processed, setProcessed] = useState<Blob | null>(null);
  const [processing, setProcessing] = useState(false);

  // Free any preview URL when the dialog closes / vehicle changes.
  const cleanupPreview = () => {
    setProcessed(null);
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
  };
  useEffect(() => {
    if (!open) cleanupPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => cleanupPreview(), []);

  const onFile = async (f: File | null | undefined) => {
    if (!f) return;
    setProcessing(true);
    try {
      cleanupPreview();
      const { blob, previewUrl } = await processImage(f);
      setProcessed(blob);
      setPreviewUrl(previewUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read image");
    } finally {
      setProcessing(false);
      // Reset input so picking the same file again refires onChange.
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!vehicle) throw new Error("No vehicle selected");
      if (!processed) throw new Error("Choose a photo first");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You're signed out");
      const path = `${u.user.id}/${vehicle.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-images")
        .upload(path, processed, { upsert: false, contentType: OUTPUT_MIME });
      if (upErr) throw upErr;
      const previous = vehicle.image_path;
      const { error: dbErr } = await (supabase as any)
        .from("customer_vehicles")
        .update({ image_path: path })
        .eq("id", vehicle.id);
      if (dbErr) {
        // Roll back the orphaned upload so storage stays clean.
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
      cleanupPreview();
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

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
  const stage: "choose" | "preview" = previewUrl ? "preview" : "choose";

  const guardedClose = (v: boolean) => {
    if (busy) return;
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={guardedClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{stage === "preview" ? "Confirm photo" : "Change photo"}</DialogTitle>
        </DialogHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {stage === "choose" ? (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Take photo
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="mr-2 h-4 w-4" /> Upload from gallery
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Remove photo
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-muted">
              {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
              <img
                src={previewUrl!}
                alt="Vehicle photo preview"
                className="mx-auto block max-h-72 w-full object-cover"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={() => {
                  cleanupPreview();
                  galleryRef.current?.click();
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Retake
              </Button>
              <Button size="lg" disabled={busy || !processed} onClick={() => upload.mutate()}>
                {upload.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Use photo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
