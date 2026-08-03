import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { Plus, Car, ChevronRight, Star, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { useVehicleImageUrl } from "@/lib/vehicle-image";
import { EmptyState } from "@/components/customer/ui/EmptyState";
import { SkeletonList } from "@/components/customer/ui/Skeletons";

export const Route = createFileRoute("/c/_authed/vehicles")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Vehicles — Urban Wash" }] }),
  component: VehiclesPage,
});

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  color: string | null;
  image_path: string | null;
  is_default: boolean | null;
  nickname: string | null;
};

const ACTIVE_SUB_STATUSES = ["active", "assigned", "awaiting_partner_assignment", "payment_pending"];
const BLOCKING_BOOKING_STATUSES = ["pending", "confirmed", "assigned", "in_progress", "paid", "payment_pending"];
const ONGOING_SERVICE_STATUSES = ["pending", "in_progress"];

type DeleteBlock = { title: string; detail: string };

/** Returns the exact blocking condition when the vehicle must not be deleted, else null. */
async function vehicleDeletionBlockReason(vehicleId: string): Promise<DeleteBlock | null> {
  const { data: sub } = await (supabase as any)
    .from("subscriptions")
    .select("id,status")
    .eq("vehicle_id", vehicleId)
    .in("status", ACTIVE_SUB_STATUSES)
    .limit(1)
    .maybeSingle();
  if (sub) {
    return sub.status === "payment_pending"
      ? {
          title: "Subscription payment is pending",
          detail:
            "This vehicle has a Daily Shine subscription waiting for payment. Complete or cancel that payment from My Plan before deleting the vehicle.",
        }
      : {
          title: "Active subscription on this vehicle",
          detail:
            "A Daily Shine subscription is currently running for this vehicle. Cancel the plan from My Plan first — deleting the vehicle would break your scheduled services.",
        };
  }

  const { data: service } = await (supabase as any)
    .from("services")
    .select("id,status,scheduled_date")
    .eq("vehicle_id", vehicleId)
    .in("status", ONGOING_SERVICE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (service) {
    return {
      title: service.status === "in_progress" ? "A service is in progress" : "A service is scheduled",
      detail:
        service.status === "in_progress"
          ? "Your partner is currently servicing this vehicle. You can delete it once the service is completed."
          : `A wash is scheduled for this vehicle${service.scheduled_date ? ` on ${service.scheduled_date}` : ""}. Wait for it to complete or ask support to cancel it first.`,
    };
  }

  const { data: booking } = await (supabase as any)
    .from("bookings")
    .select("id,status,payment_status,scheduled_date")
    .eq("vehicle_id", vehicleId)
    .in("status", BLOCKING_BOOKING_STATUSES)
    .limit(1)
    .maybeSingle();
  if (booking) {
    const when = booking.scheduled_date ? ` on ${booking.scheduled_date}` : "";
    if (booking.payment_status === "pending" || booking.status === "payment_pending") {
      return {
        title: "A payment is still pending",
        detail: `There is an unpaid booking for this vehicle${when}. Finish or cancel that payment from My Bookings before deleting the vehicle.`,
      };
    }
    return {
      title: "Active booking on this vehicle",
      detail: `This vehicle has a booking${when} with status “${String(booking.status).replace(/_/g, " ")}”. Cancel it from My Bookings first.`,
    };
  }

  return null;
}


function VehiclesPage() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const q = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, category, registration_number, color, image_path, is_default, nickname, created_at")
        .order("is_default", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const confirmDelete = useCallback(async () => {
    if (!target) return;
    setDeleting(true);
    try {
      const blocked = await vehicleDeletionBlockReason(target.id);
      if (blocked) {
        console.warn("[uw-vehicle] delete blocked", { vehicleId: target.id, reason: blocked });
        toast.error(blocked);
        setTarget(null);
        return;
      }
      console.log("[uw-vehicle] delete started", { vehicleId: target.id });
      const { error } = await (supabase as any).from("customer_vehicles").delete().eq("id", target.id);
      if (error) throw error;
      console.log("[uw-vehicle] delete success", { vehicleId: target.id });
      toast.success("Vehicle removed");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
    } catch (e: any) {
      console.error("[uw-vehicle] delete failed", e);
      toast.error(e?.message ?? "Could not remove this vehicle. Please try again.");
    } finally {
      setDeleting(false);
    }
  }, [target, qc]);

  return (
    <div className="px-5 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My vehicles</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap to edit · swipe left to delete.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/c/vehicles/add">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Link>
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {q.isLoading && <SkeletonList count={2} />}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <EmptyState
            icon={Car}
            tone="primary"
            title="No vehicles yet"
            description="Add your car to get pricing, book washes and track service history."
            action={
              <Button asChild className="h-11 rounded-full px-7 font-semibold">
                <Link to="/c/vehicles/add">Add your first vehicle</Link>
              </Button>
            }
          />
        )}
        {(q.data ?? []).map((v) => (
          <SwipeableVehicleRow key={v.id} v={v} onRequestDelete={() => setTarget(v)} />
        ))}
      </div>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !deleting) setTarget(null); }}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently remove
              {target ? ` ${target.nickname?.trim() || `${target.make} ${target.model}`}` : " this vehicle"}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete vehicle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const REVEAL = 88;

function SwipeableVehicleRow({ v, onRequestDelete }: { v: Vehicle; onRequestDelete: () => void }) {
  const navigate = useNavigate();
  const imgQ = useVehicleImageUrl({ make: v.make, model: v.model, imagePath: v.image_path });
  const primary = v.nickname?.trim() || `${v.make} ${v.model}`;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, base: offset };
    moved.current = false;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) return;
    if (Math.abs(dx) > 6) moved.current = true;
    const next = Math.min(0, Math.max(-REVEAL - 24, start.current.base + dx));
    setOffset(next);
  };

  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    setOffset((o) => (o < -REVEAL / 2 ? -REVEAL : 0));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Delete action revealed behind the card */}
      <button
        type="button"
        aria-label={`Delete ${primary}`}
        onClick={() => { setOffset(0); onRequestDelete(); }}
        className="absolute inset-y-0 right-0 flex w-[88px] flex-col items-center justify-center gap-1 bg-destructive text-destructive-foreground"
      >
        <Trash2 className="h-5 w-5" />
        <span className="text-[11px] font-semibold">Delete</span>
      </button>

      <div
        role="link"
        tabIndex={0}
        data-testid="vehicle-row"
        data-vehicle-id={v.id}
        data-is-default={v.is_default ? "true" : "false"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (moved.current) return;
          if (offset !== 0) { setOffset(0); return; }
          void navigate({ to: "/c/vehicles/$id", params: { id: v.id } });
        }}
        onKeyDown={(e) => { if (e.key === "Enter") void navigate({ to: "/c/vehicles/$id", params: { id: v.id } }); }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          touchAction: "pan-y",
        }}
        className="relative flex cursor-pointer select-none items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
      >
        <VehicleAvatar
          imageUrl={imgQ.data}
          make={v.make}
          model={v.model}
          color={v.color}
          category={v.category}
          className="h-14 w-16 rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{primary}</span>
            {v.is_default && (
              <span
                data-testid="default-badge"
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
              >
                <Star className="h-2.5 w-2.5" /> Default
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {v.nickname ? `${v.make} ${v.model} · ` : ""}
            {v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}
