import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, Calendar, Car, MapPin, MessageCircleWarning, Phone, Loader2,
  CheckCircle2, Circle, Clock, X, Pencil, Receipt, Printer, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/c/_authed/bookings/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Booking — Urban Wash" }] }),
  component: BookingDetail,
});

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

const TIMELINE = [
  { key: "pending_payment", label: "Booking confirmed", desc: "We've received your booking" },
  { key: "paid", label: "Partner being assigned", desc: "Finding the closest pro" },
  { key: "active", label: "On the way", desc: "Your partner is heading over" },
  { key: "completed", label: "Service completed", desc: "Hope your car sparkles!" },
] as const;

function statusIndex(s: string) {
  const i = TIMELINE.findIndex((t) => t.key === s);
  return i < 0 ? 0 : i;
}

function BookingDetail() {
  const { id } = useParams({ from: "/c/_authed/bookings/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const q = useQuery({
    queryKey: ["customer-booking", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bookings")
        .select("*, service_catalog:service_id(name, slug), customer_vehicles:vehicle_id(make, model, registration_number), customer_addresses:address_id(address_line, area, pincode)")
        .eq("id", id).maybeSingle();
      return data;
    },
  });

  const addons = useQuery({
    queryKey: ["booking-addons", id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("booking_addons").select("*").eq("booking_id", id);
      return data ?? [];
    },
  });

  const b = q.data;
  if (q.isLoading) return <div className="px-5 pt-10"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!b) return <div className="px-5 pt-10 text-center text-sm text-muted-foreground">Booking not found.</div>;

  const isCancelled = b.status === "cancelled";
  const isCompleted = b.status === "completed";
  const canModify = !isCancelled && !isCompleted && b.status !== "active";
  const completedAt = b.updated_at && isCompleted ? new Date(b.updated_at) : null;
  const canComplain = completedAt && (Date.now() - completedAt.getTime()) < 2 * 60 * 60 * 1000;
  const activeIdx = isCancelled ? -1 : statusIndex(b.status);

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3 px-5 py-3">
          <button onClick={() => navigate({ to: "/c/bookings" })} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">Booking #{String(b.id).slice(0, 8).toUpperCase()}</div>
            <h1 className="truncate text-base font-semibold tracking-tight">{b.service_catalog?.name ?? "Service"}</h1>
          </div>
          <StatusBadge status={b.status} />
        </div>
      </div>

      <div className="px-5">
        {/* Schedule strip */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Scheduled</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(b.scheduled_date)}
              </div>
              {b.preferred_before_time && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {b.preferred_before_time}
                </div>
              )}
            </div>
            {canModify && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setRescheduleOpen(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Reschedule
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
                  <X className="mr-1 h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Service timeline
          </div>
          {isCancelled ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              This booking was cancelled.
            </div>
          ) : (
            <ol className="space-y-3">
              {TIMELINE.map((step, i) => {
                const done = i < activeIdx;
                const current = i === activeIdx;
                return (
                  <li key={step.key} className="relative flex gap-3">
                    <div className="flex flex-col items-center">
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : current ? (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                        </span>
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40" />
                      )}
                      {i < TIMELINE.length - 1 && (
                        <span className={`mt-0.5 h-6 w-px ${done ? "bg-success" : "bg-border"}`} />
                      )}
                    </div>
                    <div className="-mt-0.5 pb-1">
                      <div className={`text-sm font-medium ${current ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{step.desc}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Vehicle + Address */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm">
          {b.customer_vehicles && (
            <Line icon={<Car className="h-4 w-4" />}>
              <span className="font-medium">{b.customer_vehicles.make} {b.customer_vehicles.model}</span>
              <span className="ml-1 text-muted-foreground">· {b.customer_vehicles.registration_number}</span>
            </Line>
          )}
          {b.customer_addresses && (
            <div className="mt-3">
              <Line icon={<MapPin className="h-4 w-4" />}>
                {b.customer_addresses.address_line}, {b.customer_addresses.area} {b.customer_addresses.pincode ?? ""}
              </Line>
            </div>
          )}
          {b.notes && (
            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Notes: </span>{b.notes}
            </div>
          )}
        </div>

        {/* Payment summary */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" /> Payment
            </div>
            <button onClick={() => setReceiptOpen(true)} className="text-[11px] font-medium text-primary hover:underline">
              View receipt
            </button>
          </div>
          <div className="space-y-1.5 text-sm">
            <Row label="Base"><span>₹{b.base_amount}</span></Row>
            {Number(b.addon_amount) > 0 && <Row label="Add-ons"><span>₹{b.addon_amount}</span></Row>}
            {Number(b.discount_amount) > 0 && <Row label="Discount"><span className="text-success">−₹{b.discount_amount}</span></Row>}
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-semibold">₹{b.total_amount}</span>
            </div>
            <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
              <span>Method: Pay after service</span>
              <PaymentBadge status={b.payment_status} />
            </div>
          </div>

          {addons.data && addons.data.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add-ons</div>
              <ul className="space-y-1.5 text-sm">
                {addons.data.map((a: any) => {
                  const qq = a.quantity ?? 1;
                  return (
                    <li key={a.id} className="flex items-center justify-between">
                      <span>{a.addon_name}{qq > 1 ? ` × ${qq}` : ""}</span>
                      <span className="text-muted-foreground">₹{Number(a.price) * qq}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl">
            <Phone className="mr-1.5 h-4 w-4" /> Call support
          </Button>
          {canComplain && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setComplaintOpen(true)}>
              <MessageCircleWarning className="mr-1.5 h-4 w-4" /> Raise complaint
            </Button>
          )}
        </div>
      </div>

      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        bookingId={b.id}
        currentDate={b.scheduled_date}
        currentSlot={b.preferred_before_time}
        onDone={() => qc.invalidateQueries({ queryKey: ["customer-booking", id] })}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        bookingId={b.id}
        onDone={() => { qc.invalidateQueries({ queryKey: ["customer-booking", id] }); qc.invalidateQueries({ queryKey: ["customer-bookings"] }); }}
      />
      <ReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} booking={b} addons={addons.data ?? []} />
      <ComplaintDialog open={complaintOpen} onOpenChange={setComplaintOpen} serviceId={b.service_id} customerId={b.user_id} partnerId={b.partner_id ?? null} />
    </div>
  );
}

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch { return s; }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending_payment: "bg-amber-500/10 text-amber-700 ring-amber-500/30",
    paid: "bg-blue-500/10 text-blue-700 ring-blue-500/30",
    active: "bg-primary/10 text-primary ring-primary/30",
    completed: "bg-success/10 text-success ring-success/30",
    cancelled: "bg-destructive/10 text-destructive ring-destructive/30",
    refunded: "bg-muted text-muted-foreground ring-border",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ring-1 ${cls}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PaymentBadge({ status }: { status: string | null }) {
  const s = status ?? "pending";
  const map: Record<string, string> = {
    pending: "text-amber-700",
    paid: "text-success",
    failed: "text-destructive",
    refunded: "text-muted-foreground",
  };
  return <span className={`font-semibold capitalize ${map[s] ?? "text-muted-foreground"}`}>{s}</span>;
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-start gap-2"><span className="mt-0.5 text-muted-foreground">{icon}</span><div className="flex-1">{children}</div></div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between text-sm"><span className="text-muted-foreground">{label}</span>{children}</div>;
}

function RescheduleDialog({ open, onOpenChange, bookingId, currentDate, currentSlot, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; bookingId: string; currentDate: string | null; currentSlot: string | null; onDone: () => void;
}) {
  const [date, setDate] = useState(currentDate ?? new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState(currentSlot ?? TIME_SLOTS[3]);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("bookings").update({
        scheduled_date: date, scheduled_time: slot, preferred_before_time: slot,
      }).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking rescheduled"); onDone(); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reschedule booking</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Date</div>
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Time slot</div>
            <div className="grid grid-cols-2 gap-2">
              {TIME_SLOTS.map((s) => (
                <button key={s} type="button" onClick={() => setSlot(s)}
                  className={`rounded-xl border py-2 text-xs font-medium ${slot === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ open, onOpenChange, bookingId, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; bookingId: string; onDone: () => void }) {
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking cancelled"); onDone(); onOpenChange(false); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cancel this booking?</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          This cannot be undone. You can always book a new slot from the home screen.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Keep booking</Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yes, cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ open, onOpenChange, booking, addons }: { open: boolean; onOpenChange: (v: boolean) => void; booking: any; addons: any[] }) {
  const idShort = String(booking.id).slice(0, 8).toUpperCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md print:shadow-none">
        <DialogHeader><DialogTitle>Payment receipt</DialogTitle></DialogHeader>
        <div id="receipt" className="rounded-2xl border border-border bg-card p-5 text-sm">
          <div className="flex items-center justify-between border-b border-dashed border-border pb-3">
            <div>
              <div className="text-base font-semibold">Urban Wash</div>
              <div className="text-[11px] text-muted-foreground">Lucknow · GST pending</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">Receipt</div>
              <div className="font-mono text-xs">#{idShort}</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div>Date: <span className="text-foreground">{formatDate(booking.scheduled_date)}</span></div>
            {booking.preferred_before_time && <div>Slot: <span className="text-foreground">{booking.preferred_before_time}</span></div>}
            {booking.customer_vehicles && (
              <div>Vehicle: <span className="text-foreground">{booking.customer_vehicles.make} {booking.customer_vehicles.model} · {booking.customer_vehicles.registration_number}</span></div>
            )}
          </div>
          <div className="mt-3 border-t border-dashed border-border pt-3">
            <div className="font-medium">{booking.service_catalog?.name ?? "Service"}</div>
            <Row label="Base"><span>₹{booking.base_amount}</span></Row>
            {addons.map((a) => {
              const qq = a.quantity ?? 1;
              return (
                <Row key={a.id} label={`${a.addon_name}${qq > 1 ? ` × ${qq}` : ""}`}>
                  <span>₹{Number(a.price) * qq}</span>
                </Row>
              );
            })}
            {Number(booking.discount_amount) > 0 && (
              <Row label="Discount"><span className="text-success">−₹{booking.discount_amount}</span></Row>
            )}
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <span className="font-semibold">Total paid</span>
              <span className="text-lg font-semibold">₹{booking.total_amount}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground capitalize">
              Status: {(booking.payment_status ?? "pending").replaceAll("_", " ")}
            </div>
          </div>
          <div className="mt-3 border-t border-dashed border-border pt-3 text-center text-[10px] text-muted-foreground">
            Thank you for choosing Urban Wash · support@urbanwash.in
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComplaintDialog({ open, onOpenChange, serviceId, customerId, partnerId }: { open: boolean; onOpenChange: (v: boolean) => void; serviceId: string | null; customerId: string; partnerId: string | null }) {
  const [type, setType] = useState("quality");
  const [desc, setDesc] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("complaints").insert({
        customer_id: customerId,
        service_id: serviceId,
        partner_id: partnerId,
        complaint_type: type,
        description: desc.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Complaint raised. We'll get back within 24h."); onOpenChange(false); setDesc(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Raise a complaint</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {["quality", "punctuality", "behaviour", "damage", "other"].map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`rounded-full border px-3 py-1.5 text-xs capitalize ${type === t ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{t}</button>
            ))}
          </div>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder="Tell us what went wrong…" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
