import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Camera, Check, Loader2, Phone, MapPin } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const ANGLES = ["front", "back", "left", "right"] as const;
type Angle = (typeof ANGLES)[number];

export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: ServiceDetail,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: service } = useQuery({
    queryKey: ["service", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("*, customers(*), vehicles(*)")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: photos, refetch: refetchPhotos } = useQuery({
    queryKey: ["service-photos", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_photos").select("*").eq("service_id", id);
      return data ?? [];
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("services")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service", id] }),
  });

  const uploaded = new Set((photos ?? []).map((p) => p.angle));
  const allUploaded = ANGLES.every((a) => uploaded.has(a));

  const complete = useMutation({
    mutationFn: async () => {
      if (!allUploaded) throw new Error("Upload all 4 photos first");
      const { error } = await supabase
        .from("services")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("earnings").insert({
        partner_id: u.user!.id,
        service_id: id,
        amount: Number(service?.rate_per_car ?? 80),
        earning_date: new Date().toISOString().slice(0, 10),
        type: "service",
      });
      await supabase.rpc as any; // noop
      await supabase
        .from("partners")
        .update({ total_cars_completed: ((service as any)?._t ?? 0) + 1 })
        .eq("id", u.user!.id);
    },
    onSuccess: () => {
      toast.success("Service complete. ₹" + service?.rate_per_car + " added.");
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const c = service?.customers as any;
  const v = service?.vehicles as any;

  return (
    <div className="mx-auto max-w-md px-5 pt-6">
      <button onClick={() => navigate({ to: "/app" })} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">{c?.full_name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{v?.make} {v?.model} · {v?.color}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{v?.registration_number}</p>
          </div>
          <Badge variant="outline" className="capitalize">{service?.status?.replace("_", " ")}</Badge>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c?.address_line}, {c?.area}</p>
          <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />+91 {c?.phone}</p>
        </div>
        {v?.parking_notes && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">🅿️ {v.parking_notes}</p>
        )}
      </Card>

      {service?.status === "pending" && (
        <Button size="lg" className="mt-4 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Start service
        </Button>
      )}

      {(service?.status === "in_progress" || service?.status === "completed") && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Photo verification</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {ANGLES.map((a) => (
              <PhotoSlot key={a} angle={a} serviceId={id} done={uploaded.has(a)} onUploaded={() => refetchPhotos()} />
            ))}
          </div>
          {service.status === "in_progress" && (
            <Button size="lg" className="mt-5 w-full" onClick={() => complete.mutate()} disabled={!allUploaded || complete.isPending}>
              {complete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {allUploaded ? "Mark complete" : `${uploaded.size}/4 photos uploaded`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function PhotoSlot({ angle, serviceId, done, onUploaded }: { angle: Angle; serviceId: string; done: boolean; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handle = async (file: File) => {
    setUploading(true);
    const { data: u } = await supabase.auth.getUser();
    const path = `${u.user!.id}/${serviceId}/${angle}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
    await supabase.from("service_photos").insert({
      service_id: serviceId,
      partner_id: u.user!.id,
      angle,
      storage_path: path,
    });
    setUploading(false);
    onUploaded();
  };

  return (
    <button
      onClick={() => inputRef.current?.click()}
      className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs font-medium capitalize transition ${
        done ? "border-success bg-success/10 text-[color:var(--success)]" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : done ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      {angle}
    </button>
  );
}
