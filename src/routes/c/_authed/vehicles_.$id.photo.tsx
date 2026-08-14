import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { useVehicleImageUrl } from "@/lib/vehicle-image";

export const Route = createFileRoute("/c/_authed/vehicles_/$id/photo")({
  ssr: true,
  head: () => ({ meta: [{ title: "Vehicle photo — Urban Wash" }] }),
  component: VehiclePhotoPage,
});

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  color: string | null;
  image_path: string | null;
};

function VehiclePhotoPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const q = useQuery({
    queryKey: ["customer-vehicle", id],
    queryFn: async (): Promise<Vehicle> => {
      const { data, error } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, category, color, image_path")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Vehicle not found");
      return data as Vehicle;
    },
  });

  const imgQ = useVehicleImageUrl({
    make: q.data?.make,
    model: q.data?.model,
    imagePath: q.data?.image_path,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
      if (file.size > 8 * 1024 * 1024) throw new Error("Image is too large (max 8 MB)");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You're signed out");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${u.user.id}/${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      // Save the new path and try to remove the previous one (best effort).
      const previous = q.data?.image_path;
      const { error: dbErr } = await (supabase as any)
        .from("customer_vehicles")
        .update({ image_path: path })
        .eq("id", id);
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
      qc.invalidateQueries({ queryKey: ["customer-vehicle", id] });
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Upload failed"),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const previous = q.data?.image_path;
      const { error } = await (supabase as any)
        .from("customer_vehicles")
        .update({ image_path: null })
        .eq("id", id);
      if (error) throw error;
      if (previous) await supabase.storage.from("vehicle-images").remove([previous]);
    },
    onSuccess: () => {
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["customer-vehicle", id] });
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle-image-url"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const onFile = (f: File | null | undefined) => {
    if (!f) return;
    setUploading(true);
    upload.mutate(f);
  };

  if (q.isLoading) {
    return <div className="px-5 pt-6"><div className="h-40 animate-pulse rounded-3xl bg-muted" /></div>;
  }
  if (!q.data) {
    return (
      <div className="px-5 pt-6 text-sm text-muted-foreground">
        Vehicle not found.{" "}
        <Link to="/c/vehicles" className="text-primary underline">Back</Link>
      </div>
    );
  }

  const v = q.data;
  const hasCustomPhoto = !!v.image_path;
  const busy = uploading || upload.isPending || remove.isPending;

  return (
    <div className="px-5 pt-6 pb-24">
      <button
        onClick={() => navigate({ to: "/c/vehicles/$id", params: { id } })}
        className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">Vehicle photo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A clear photo helps our team spot your car at the parking spot.
      </p>

      <div className="mt-6 flex items-center justify-center rounded-3xl border border-border bg-card p-6">
        <VehicleAvatar
          imageUrl={imgQ.data}
          make={v.make}
          model={v.model}
          color={v.color}
          category={v.category}
          className="h-40 w-56 rounded-2xl"
        />
      </div>

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

      <div className="mt-6 space-y-3">
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
    </div>
  );
}
