import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Image as ImageIcon, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

/**
 * Inline dialog to edit a vehicle's details without navigating to a new page.
 * Updates nickname, color, parking notes and default flag directly.
 */
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
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState("");
  const [parking, setParking] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!vehicle) return;
    setNickname(vehicle.nickname ?? "");
    setColor(vehicle.color ?? "");
    setParking(vehicle.parking_notes ?? "");
    setIsDefault(!!vehicle.is_default);
  }, [vehicle?.id, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!vehicle) return;
      const patch: Record<string, unknown> = {
        nickname: nickname.trim() || null,
        color: color.trim() || null,
        parking_notes: parking.trim() || null,
        is_default: isDefault,
      };
      const { error } = await (supabase as any)
        .from("customer_vehicles")
        .update(patch)
        .eq("id", vehicle.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle updated");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", vehicle?.id] });
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (!vehicle) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {vehicle.make} {vehicle.model}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nickname</Label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Family car, Office car…"
              className="mt-1.5"
              maxLength={40}
            />
          </div>
          <div>
            <Label>Colour</Label>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="White"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Parking instructions</Label>
            <Textarea
              value={parking}
              onChange={(e) => setParking(e.target.value)}
              placeholder="B-block basement, slot 14."
              className="mt-1.5"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <Star className="h-4 w-4 text-primary" />
            <span>Set as default vehicle</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline photo change flow: opens a small chooser (Take photo / Gallery / Remove)
 * and uploads immediately. No navigation.
 */
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

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!vehicle) throw new Error("No vehicle selected");
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
      if (file.size > 8 * 1024 * 1024) throw new Error("Image is too large (max 8 MB)");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You're signed out");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${u.user.id}/${vehicle.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
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
    },
    onSuccess: () => {
      toast.success("Photo updated");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", vehicle?.id] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
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
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const onFile = (f: File | null | undefined) => {
    if (!f) return;
    upload.mutate(f);
  };

  const busy = upload.isPending || remove.isPending;
  const hasCustomPhoto = !!vehicle?.image_path;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change photo</DialogTitle>
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

        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
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
              <Trash2 className="mr-2 h-4 w-4" /> Remove photo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
