import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Car, ChevronRight, Star, Trash2, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const navigate = useNavigate();
  const [target, setTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [block, setBlock] = useState<DeleteBlock | null>(null);

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

  // Run the blocking check as soon as the confirmation opens, so the customer
  // sees the exact reason instead of a generic failure after tapping Delete.
  useEffect(() => {
    if (!target) { setBlock(null); setChecking(false); return; }
    let cancelled = false;
    setBlock(null);
    setChecking(true);
    void vehicleDeletionBlockReason(target.id)
      .then((reason) => { if (!cancelled) setBlock(reason); })
      .catch((e) => {
        console.error("[uw-vehicle] block check failed", e);
        if (!cancelled) {
          setBlock({
            title: "Couldn’t verify this vehicle",
            detail: "We couldn’t check for active services right now. Please try again in a moment.",
          });
        }
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [target]);

  const confirmDelete = useCallback(async () => {
    if (!target) return;
    setDeleting(true);
    try {
      const blocked = await vehicleDeletionBlockReason(target.id);
      if (blocked) {
        console.warn("[uw-vehicle] delete blocked", { vehicleId: target.id, reason: blocked.title });
        setBlock(blocked);
        toast.error(blocked.title, { description: blocked.detail });
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
    <div className="min-h-screen bg-[#FFF9F3] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#FFF9F3]/90 px-5 pt-8 pb-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
             <button 
               onClick={() => navigate({ to: "/c/home" })} 
               className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
             >
               <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
             </button>
             <div>
                <h1 className="text-2xl font-black tracking-tight text-[#1a1a1a]">My Garage</h1>
                <p className="mt-0.5 text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">Manage Vehicles</p>
             </div>
          </div>
          <Button asChild className="h-11 rounded-2xl bg-primary px-5 font-black text-[13px] shadow-lg shadow-primary/20 transition-all active:scale-95">
            <Link to="/c/vehicles/add">
              <Plus className="mr-1.5 h-4 w-4" /> Add Car
            </Link>
          </Button>
        </div>
      </div>

      <div className="px-5 mt-4 space-y-4">
        {q.isLoading && (
          <div className="space-y-4">
             <div className="h-28 animate-pulse rounded-[32px] bg-white border border-black/5" />
             <div className="h-28 animate-pulse rounded-[32px] bg-white border border-black/5" />
          </div>
        )}
        
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <div className="mt-12">
            <EmptyState
              icon={Car}
              tone="primary"
              title="Garage is empty"
              description="Add your car to see tailored pricing and book professional services."
              action={
                <Button asChild className="h-14 rounded-2xl px-8 font-black shadow-lg shadow-primary/20 transition-all active:scale-95">
                  <Link to="/c/vehicles/add">Add your car</Link>
                </Button>
              }
            />
          </div>
        )}

        {(q.data ?? []).map((v) => (
          <SwipeableVehicleRow key={v.id} v={v} onRequestDelete={() => setTarget(v)} />
        ))}
        
        {/* Info Card */}
        {!q.isLoading && (q.data ?? []).length > 0 && (
          <div className="mt-8 flex items-center gap-3 rounded-[28px] bg-primary/5 p-4 border border-primary/10">
             <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
             </div>
             <p className="text-[12px] font-bold text-primary/70 leading-snug">
               Your vehicles are stored securely. Swipe left on any car to remove it from your garage.
             </p>
          </div>
        )}
      </div>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !deleting) setTarget(null); }}>
        <AlertDialogContent className="rounded-[40px] border-none bg-white p-8 shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
               <Trash2 className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-center text-2xl font-black text-[#1a1a1a]">
              {block ? "Can’t delete car" : "Delete vehicle?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[15px] font-bold text-muted-foreground/70 leading-relaxed px-2">
              {block ? (
                <span data-testid="vehicle-delete-block-reason">
                  <span className="text-destructive">{block.title}</span>
                  <span className="mt-2 block">{block.detail}</span>
                </span>
              ) : checking ? (
                <span className="flex flex-col items-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" /> 
                  Verifying active services…
                </span>
              ) : (
                <>
                  Are you sure you want to remove 
                  <span className="text-[#1a1a1a]"> {target ? ` ${target.nickname?.trim() || `${target.make} ${target.model}`}` : " this vehicle"}</span>?
                  This will also remove its service history.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 flex-col gap-3 sm:flex-col">
            {!block && (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
                disabled={deleting || checking}
                data-testid="vehicle-delete-confirm"
                className="h-14 w-full rounded-2xl bg-destructive text-white font-black shadow-lg shadow-destructive/20 transition-all active:scale-95"
              >
                {deleting ? (
                   <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Deleting...</span>
                   </div>
                ) : "Yes, remove vehicle"}
              </AlertDialogAction>
            )}
            <AlertDialogCancel 
              disabled={deleting}
              className="h-14 w-full rounded-2xl border-none bg-[#FFF9F3] text-[#1a1a1a] font-black transition-all active:scale-95 m-0"
            >
              {block ? "Got it" : "Cancel"}
            </AlertDialogCancel>
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
