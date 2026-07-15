import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { useVehicleImageUrl } from "@/lib/vehicle-image";

export const Route = createFileRoute("/c/_authed/vehicles_/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Edit vehicle — Urban Wash" }] }),
  component: EditVehiclePage,
});

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  color: string | null;
  parking_notes: string | null;
  image_path: string | null;
  is_default: boolean | null;
  nickname: string | null;
};

function EditVehiclePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["customer-vehicle", id],
    queryFn: async (): Promise<Vehicle> => {
      const { data, error } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, category, registration_number, color, parking_notes, image_path, is_default, nickname")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Vehicle not found");
      return data as Vehicle;
    },
  });

  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState("");
  const [parking, setParking] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setNickname(q.data.nickname ?? "");
    setColor(q.data.color ?? "");
    setParking(q.data.parking_notes ?? "");
    setIsDefault(!!q.data.is_default);
  }, [q.data?.id]);

  const imgQ = useVehicleImageUrl({
    make: q.data?.make,
    model: q.data?.model,
    imagePath: q.data?.image_path,
  });

  const save = useMutation({
    mutationFn: async () => {
      const patch: any = {
        nickname: nickname.trim() || null,
        color: color.trim() || null,
        parking_notes: parking.trim() || null,
        is_default: isDefault,
      };
      const { error } = await (supabase as any)
        .from("customer_vehicles")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      // If this vehicle is now the default, unset the flag on siblings.
      if (isDefault) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          await (supabase as any)
            .from("customer_vehicles")
            .update({ is_default: false })
            .eq("user_id", u.user.id)
            .neq("id", id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Vehicle updated");
      qc.invalidateQueries({ queryKey: ["customer-vehicle", id] });
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      navigate({ to: "/c/vehicles" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const setDefault = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      // Trigger tg_customer_vehicles_single_default unsets siblings.
      const { error } = await (supabase as any)
        .from("customer_vehicles")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setIsDefault(true);
      const label = q.data?.nickname?.trim() || `${q.data?.make ?? ""} ${q.data?.model ?? ""}`.trim() || "This vehicle";
      toast.success(`${label} is now your default`, {
        description: "It will be selected first on Home & Bookings.",
      });
      qc.invalidateQueries({ queryKey: ["customer-vehicle", id] });
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not set default"),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle removed");
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      navigate({ to: "/c/vehicles" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  if (q.isLoading) {
    return (
      <div className="px-5 pt-6">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-40 animate-pulse rounded-3xl bg-muted" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="px-5 pt-6 text-sm text-muted-foreground">
        Vehicle not found.{" "}
        <Link to="/c/vehicles" className="text-primary underline">Back to vehicles</Link>
      </div>
    );
  }

  const v = q.data;

  return (
    <div className="px-5 pt-6 pb-32">
      <button
        onClick={() => navigate({ to: "/c/vehicles" })}
        className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="text-2xl font-semibold tracking-tight">Edit vehicle</h1>

      {/* Read-only vehicle identity — cannot be changed here. */}
      <div className="mt-5 flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
        <VehicleAvatar
          imageUrl={imgQ.data}
          make={v.make}
          model={v.model}
          color={color}
          category={v.category}
          className="h-16 w-20 rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">{v.make} {v.model}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <Link to="/c/vehicles/$id/photo" params={{ id: v.id }}>
            <Camera className="mr-1 h-3.5 w-3.5" /> Photo
          </Link>
        </Button>
      </div>

      <div className="mt-6 space-y-5">
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
            placeholder="B-block basement, slot 14. Ask guard for key."
            className="mt-1.5"
            rows={3}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Helps our team reach your car without calling.
          </p>
        </div>

        <div
          data-testid="default-vehicle-card"
          data-is-default={isDefault ? "true" : "false"}
          className={`flex items-center justify-between rounded-2xl border p-4 transition ${
            isDefault ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${isDefault ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <Star className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold">
                {isDefault ? "Default vehicle" : "Not your default"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isDefault ? "Selected first on Home & Bookings." : "Tap to make this your default."}
              </div>
            </div>
          </div>
          {isDefault ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              Current
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="set-as-default-button"
              onClick={() => setDefault.mutate()}
              disabled={setDefault.isPending}
            >
              {setDefault.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Star className="mr-1 h-3.5 w-3.5" />
              )}
              Set as default
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <Button
          size="lg"
          className="w-full"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        <Button
          size="lg"
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => {
            if (confirm(`Remove ${v.make} ${v.model}? This cannot be undone.`)) del.mutate();
          }}
          disabled={del.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Remove vehicle
        </Button>
      </div>
    </div>
  );
}
