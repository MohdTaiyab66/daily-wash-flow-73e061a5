import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Loader2, Star, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { useVehicleImageUrl } from "@/lib/vehicle-image";
import { PageTitle, Muted, Surface, StatusChip } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";

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
      // Trigger tg_customer_vehicles_single_default unsets siblings.
      // RLS restricts to auth.uid()'s rows; no need to fetch the user here.
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
    <div className="min-h-screen bg-[#FFF9F3] flex flex-col">
      <header className="px-5 pt-6 pb-4">
        <button
          onClick={() => navigate({ to: "/c/vehicles" })}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <PageTitle>Edit vehicle</PageTitle>
      </header>

      <main className="flex-1 px-5 pb-32 space-y-6">
        {/* Vehicle Identity Surface */}
        <Surface className="border-primary/10 bg-white p-3 flex items-center gap-4">
          <div className="h-16 w-20 bg-muted/30 rounded-xl flex items-center justify-center shrink-0">
            <VehicleAvatar
              imageUrl={imgQ.data}
              make={v.make}
              model={v.model}
              className="h-12 w-16"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg leading-tight truncate">{v.make} {v.model}</div>
            <div className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
              {v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}
            </div>
          </div>
          <Button asChild size="icon" variant="secondary" className="h-9 w-9 rounded-full shrink-0">
            <Link to="/c/vehicles/$id/photo" params={{ id: v.id }}>
              <Camera className="h-4 w-4" />
            </Link>
          </Button>
        </Surface>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-[13px] font-bold text-foreground/80 ml-1">Nickname (Optional)</Label>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Family car, Office car"
              className="h-13 rounded-xl border-border/60 bg-white"
              maxLength={40}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] font-bold text-foreground/80 ml-1">Color</Label>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="White"
              className="h-13 rounded-xl border-border/60 bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] font-bold text-foreground/80 ml-1">Parking instructions (Optional)</Label>
            <Textarea
              value={parking}
              onChange={(e) => setParking(e.target.value)}
              placeholder="e.g. B-block basement, slot 14"
              className="rounded-xl border-border/60 bg-white min-h-[100px] resize-none"
            />
            <p className="text-[11px] text-muted-foreground ml-1">
              Helps our team reach your car without calling.
            </p>
          </div>

          <button
            type="button"
            onClick={() => !isDefault && setDefault.mutate()}
            disabled={setDefault.isPending}
            className={cn(
              "w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-200",
              isDefault 
                ? "border-primary bg-primary/5 shadow-sm" 
                : "border-border/60 bg-white hover:border-primary/30"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                isDefault ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
              )}>
                <Star className="h-5 w-5" fill={isDefault ? "currentColor" : "none"} />
              </div>
              <div className="text-left">
                <div className="text-[14px] font-bold">Default vehicle</div>
                <Muted className="text-[11px]">Selected first on Home & Bookings</Muted>
              </div>
            </div>
            {isDefault ? (
              <StatusChip tone="brand">Current</StatusChip>
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
            )}
          </button>
        </div>

        <div className="pt-4 pb-12">
          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive h-12 rounded-xl font-medium"
            onClick={() => {
              if (confirm(`Remove ${v.make} ${v.model}? This cannot be undone.`)) del.mutate();
            }}
            disabled={del.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Remove vehicle
          </Button>
        </div>
      </main>

      {/* Sticky Bottom Button */}
      <div className="fixed inset-x-0 bottom-0 p-5 bg-gradient-to-t from-[#FFF9F3] via-[#FFF9F3] to-transparent pt-10">
        <Button
          size="lg"
          className="w-full h-14 rounded-2xl shadow-lg shadow-primary/20 text-base font-bold gap-2"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </div>
  );
}
