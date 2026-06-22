import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, Car, MapPin, MessageCircleWarning, Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/c/_authed/bookings/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Booking — Urban Wash" }] }),
  component: BookingDetail,
});

function BookingDetail() {
  const { id } = useParams({ from: "/c/_authed/bookings/$id" });
  const navigate = useNavigate();
  const [complaintOpen, setComplaintOpen] = useState(false);

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

  const completedAt = b.updated_at && b.status === "completed" ? new Date(b.updated_at) : null;
  const canComplain = completedAt && (Date.now() - completedAt.getTime()) < 2 * 60 * 60 * 1000;

  return (
    <div className="pb-10">
      <div className="flex items-center gap-3 px-5 pt-6">
        <button onClick={() => navigate({ to: "/c/bookings" })} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Booking</h1>
      </div>

      <div className="px-5">
        <div className="mt-5 rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">{b.service_catalog?.name ?? "Service"}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" /> {b.scheduled_date}{b.preferred_before_time ? ` · ${b.preferred_before_time}` : ""}
              </div>
            </div>
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium capitalize text-accent-foreground">
              {b.status?.replaceAll("_", " ")}
            </span>
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
            {b.customer_vehicles && (
              <Line icon={<Car className="h-4 w-4" />}>
                {b.customer_vehicles.make} {b.customer_vehicles.model} · {b.customer_vehicles.registration_number}
              </Line>
            )}
            {b.customer_addresses && (
              <Line icon={<MapPin className="h-4 w-4" />}>
                {b.customer_addresses.address_line}, {b.customer_addresses.area} {b.customer_addresses.pincode ?? ""}
              </Line>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-4 text-sm">
            <Row label="Base"><span>₹{b.base_amount}</span></Row>
            {b.addon_amount > 0 && <Row label="Add-ons"><span>₹{b.addon_amount}</span></Row>}
            {b.discount_amount > 0 && <Row label="Discount"><span className="text-success">−₹{b.discount_amount}</span></Row>}
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-semibold">₹{b.total_amount}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground capitalize">
              Payment: {b.payment_status?.replaceAll("_", " ") ?? "pending"}
            </div>
          </div>

          {addons.data && addons.data.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add-ons</div>
              <ul className="space-y-1.5 text-sm">
                {addons.data.map((a: any) => {
                  const q = a.quantity ?? 1;
                  return (
                    <li key={a.id} className="flex items-center justify-between">
                      <span>{a.addon_name}{q > 1 ? ` × ${q}` : ""}</span>
                      <span className="text-muted-foreground">₹{Number(a.price) * q}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl">
            <Phone className="mr-1.5 h-4 w-4" /> Call partner
          </Button>
          {canComplain && (
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setComplaintOpen(true)}>
              <MessageCircleWarning className="mr-1.5 h-4 w-4" /> Raise complaint
            </Button>
          )}
        </div>
      </div>

      <ComplaintDialog open={complaintOpen} onOpenChange={setComplaintOpen} serviceId={b.service_id} customerId={b.user_id} partnerId={b.partner_id ?? null} />
    </div>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-start gap-2"><span className="mt-0.5 text-muted-foreground">{icon}</span><div className="flex-1">{children}</div></div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between text-sm"><span className="text-muted-foreground">{label}</span>{children}</div>;
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
