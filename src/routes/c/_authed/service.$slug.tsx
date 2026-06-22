import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calendar, Car, ChevronRight, Loader2, MapPin, Plus, Sparkles, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Book service — Urban Wash" }] }),
  component: ServiceDetail,
});

type Service = {
  id: string; slug: string; name: string; description: string; banner_url: string | null;
  price_hatchback: number; price_sedan_suv: number; service_type: string; benefits: string[] | null;
  duration_minutes: number | null;
};
type Vehicle = { id: string; make: string; model: string; category: string; registration_number: string };
type Address = { id: string; label: string; address_line: string; area: string; pincode: string | null };
type Addon = { id: string; name: string; description: string | null; price_hatchback: number; price_sedan_suv: number; applies_to_slugs: string[] };

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

function ServiceDetail() {
  const { slug } = useParams({ from: "/c/_authed/service/$slug" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [slot, setSlot] = useState<string>(TIME_SLOTS[3]);
  const [notes, setNotes] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);

  const serviceQ = useQuery({
    queryKey: ["service", slug],
    queryFn: async (): Promise<Service | null> => {
      const { data, error } = await (supabase as any)
        .from("service_catalog").select("*").eq("slug", slug).eq("active", true).maybeSingle();
      if (error) throw error;
      return data as Service | null;
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data } = await (supabase as any).from("customer_vehicles").select("*").order("created_at");
      return (data ?? []) as Vehicle[];
    },
  });

  const addressesQ = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: async (): Promise<Address[]> => {
      const { data } = await (supabase as any).from("customer_addresses").select("*").order("created_at");
      return (data ?? []) as Address[];
    },
  });

  const addonsQ = useQuery({
    queryKey: ["service-addons", slug],
    queryFn: async (): Promise<Addon[]> => {
      const { data } = await (supabase as any).from("service_addons").select("*").eq("active", true).order("sort_order");
      return ((data ?? []) as Addon[]).filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug));
    },
  });

  const discountQ = useQuery({
    queryKey: ["mv-discount"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("multi_vehicle_discounts").select("*").eq("active", true).order("vehicle_count");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!vehicleId) {
      const stored = localStorage.getItem("uw_customer_vehicle");
      setVehicleId(stored ?? vehiclesQ.data?.[0]?.id ?? null);
    }
  }, [vehiclesQ.data, vehicleId]);

  useEffect(() => {
    if (!addressId && addressesQ.data?.length) {
      const def = addressesQ.data.find((a) => (a as any).is_default) ?? addressesQ.data[0];
      setAddressId(def?.id ?? null);
    }
  }, [addressesQ.data, addressId]);

  const service = serviceQ.data;
  const vehicle = vehiclesQ.data?.find((v) => v.id === vehicleId);
  const address = addressesQ.data?.find((a) => a.id === addressId);
  const isSUV = vehicle?.category === "sedan_suv";

  const basePrice = useMemo(() => {
    if (!service) return 0;
    return isSUV ? service.price_sedan_suv : service.price_hatchback;
  }, [service, isSUV]);

  const addonPrice = useMemo(() => {
    if (!addonsQ.data) return 0;
    return addonsQ.data.reduce((s, a) => {
      const q = addonQty[a.id] ?? 0;
      if (!q) return s;
      return s + q * (isSUV ? a.price_sedan_suv : a.price_hatchback);
    }, 0);
  }, [addonsQ.data, addonQty, isSUV]);

  const vehicleCount = vehiclesQ.data?.length ?? 1;
  const discountPct = useMemo(() => {
    const tiers = (discountQ.data ?? []).filter((d: any) => d.vehicle_count <= vehicleCount);
    return tiers.length ? Math.max(...tiers.map((d: any) => d.percent)) : 0;
  }, [discountQ.data, vehicleCount]);

  const subtotal = basePrice + addonPrice;
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountAmt;
  const addonItemsCount = Object.values(addonQty).reduce((a, b) => a + b, 0);

  const setQty = (id: string, q: number) => {
    setAddonQty((prev) => {
      const next = { ...prev };
      if (q <= 0) delete next[id]; else next[id] = Math.min(q, 20);
      return next;
    });
  };


  const confirm = async () => {
    if (!service) return;
    if (!vehicle) { toast.error("Add a vehicle first"); return; }
    if (!address) { toast.error("Add a service address"); return; }
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSubmitting(false); toast.error("Please sign in again"); return; }

    const { data: booking, error } = await (supabase as any).from("bookings").insert({
      user_id: u.user.id,
      service_id: service.id,
      vehicle_id: vehicle.id,
      address_id: address.id,
      scheduled_date: date,
      scheduled_time: slot,
      preferred_before_time: slot,
      notes: notes || null,
      base_amount: basePrice,
      addon_amount: addonPrice,
      discount_amount: discountAmt,
      total_amount: total,
      status: "pending_assignment",
      payment_status: "cash_on_service",
    }).select("id").single();
    if (error) { setSubmitting(false); toast.error(error.message || "Could not confirm booking"); return; }

    const addonEntries = Object.entries(addonQty).filter(([, q]) => q > 0);
    if (addonEntries.length && addonsQ.data) {
      const byId = new Map(addonsQ.data.map((a) => [a.id, a]));
      const rows = addonEntries.flatMap(([id, q]) => {
        const a = byId.get(id);
        if (!a) return [];
        return [{
          booking_id: booking.id,
          addon_key: a.id,
          addon_name: a.name,
          price: isSUV ? a.price_sedan_suv : a.price_hatchback,
          quantity: q,
        }];
      });
      const { error: addonErr } = await (supabase as any).from("booking_addons").insert(rows);
      if (addonErr) { setSubmitting(false); toast.error(addonErr.message); return; }
    }


    setSubmitting(false);
    toast.success("Booking confirmed!");
    qc.invalidateQueries({ queryKey: ["customer-bookings"] });
    navigate({ to: "/c/bookings" });
  };


  if (serviceQ.isLoading) {
    return <div className="px-5 pt-10"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  }
  if (!service) {
    return (
      <div className="px-5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Service not found.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/c/home">Back to home</Link></Button>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Banner */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-accent to-card">
        <button onClick={() => navigate({ to: "/c/home" })}
          className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-card/90 backdrop-blur">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {service.banner_url ? (
          <img src={service.banner_url} alt={service.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-primary">
            <Sparkles className="h-14 w-14" />
          </div>
        )}
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>

        {service.benefits?.length ? (
          <ul className="mt-4 space-y-1.5">
            {service.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Vehicle */}
        <SectionCard icon={<Car className="h-4 w-4" />} title="Vehicle" hint={vehicle ? "Change" : "Add"}>
          {vehiclesQ.data?.length ? (
            <select value={vehicleId ?? ""} onChange={(e) => { setVehicleId(e.target.value); localStorage.setItem("uw_customer_vehicle", e.target.value); }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
              {vehiclesQ.data.map((v) => (
                <option key={v.id} value={v.id}>{v.make} {v.model} · {v.registration_number}</option>
              ))}
            </select>
          ) : (
            <Button asChild variant="outline" size="sm"><Link to="/c/vehicles/add"><Plus className="mr-1 h-4 w-4" /> Add vehicle</Link></Button>
          )}
        </SectionCard>

        {/* Address */}
        <SectionCard icon={<MapPin className="h-4 w-4" />} title="Service address">
          {addressesQ.data?.length ? (
            <div className="space-y-2">
              {addressesQ.data.map((a) => (
                <button key={a.id} onClick={() => setAddressId(a.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm ${
                    addressId === a.id ? "border-primary bg-accent" : "border-border hover:bg-muted"
                  }`}>
                  <div className="flex-1">
                    <div className="font-medium">{a.label || "Address"}</div>
                    <div className="text-xs text-muted-foreground">{a.address_line}, {a.area} {a.pincode ?? ""}</div>
                  </div>
                </button>
              ))}
              <Button onClick={() => setAddrOpen(true)} variant="outline" size="sm" className="w-full">
                <Plus className="mr-1 h-4 w-4" /> Add new address
              </Button>
            </div>
          ) : (
            <Button onClick={() => setAddrOpen(true)} variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add address</Button>
          )}
        </SectionCard>

        {/* Add-ons */}
        {addonsQ.data && addonsQ.data.length > 0 && (
          <SectionCard icon={<Sparkles className="h-4 w-4" />} title="Add-ons" hint="Tap + to add more">
            <div className="space-y-2">
              {addonsQ.data.map((a) => {
                const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
                const q = addonQty[a.id] ?? 0;
                const active = q > 0;
                return (
                  <div key={a.id}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 ${
                      active ? "border-primary bg-accent" : "border-border"
                    }`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.name}</div>
                      {a.description && <div className="mt-0.5 text-[11px] text-muted-foreground">{a.description}</div>}
                      <div className="mt-1 text-[11px] text-muted-foreground">+₹{p} each{q > 1 ? ` · ₹${p * q} total` : ""}</div>
                    </div>
                    {q === 0 ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setQty(a.id, 1)} className="shrink-0 rounded-full">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2 rounded-full border border-primary bg-card px-1 py-0.5">
                        <button type="button" onClick={() => setQty(a.id, q - 1)} aria-label="Decrease"
                          className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-sm font-semibold">{q}</span>
                        <button type="button" onClick={() => setQty(a.id, q + 1)} aria-label="Increase"
                          className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}


        {/* Date + Slot */}
        <SectionCard icon={<Calendar className="h-4 w-4" />} title="When">
          <Input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((s) => (
              <button key={s} onClick={() => setSlot(s)}
                className={`rounded-xl border py-2 text-xs font-medium ${
                  slot === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                }`}>
                {s}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Summary */}
        <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm">
          <Row label="Base"><span>₹{basePrice}</span></Row>
          {addonPrice > 0 && <Row label={`Add-ons (${addonItemsCount})`}><span>₹{addonPrice}</span></Row>}
          {discountPct > 0 && (
            <Row label={`Multi-vehicle discount (${discountPct}%)`}>
              <span className="text-success">−₹{discountAmt}</span>
            </Row>
          )}
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-semibold">₹{total}</span>
          </div>
        </div>
      </div>

      {/* Sticky checkout bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-xl font-semibold">₹{total}</div>
            <div className="text-[10px] text-muted-foreground">Pay after service · Razorpay soon</div>
          </div>
          <Button onClick={confirm} disabled={submitting} size="lg" className="rounded-full px-6">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <AddressDialog open={addrOpen} onOpenChange={setAddrOpen} onCreated={(id) => { setAddressId(id); qc.invalidateQueries({ queryKey: ["customer-addresses"] }); }} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-1.5 flex items-baseline justify-between"><span className="text-muted-foreground">{label}</span>{children}</div>;
}

function SectionCard({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{icon}</span> {title}
        </div>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function AddressDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [label, setLabel] = useState("Home");
  const [line, setLine] = useState("");
  const [area, setArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (line.trim().length < 4) { toast.error("Enter a valid address"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { data, error } = await (supabase as any).from("customer_addresses").insert({
      user_id: u.user.id, label, address_line: line.trim(), area: area.trim(),
      pincode: pincode || null, parking_notes: notes || null,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address saved");
    onCreated(data.id);
    onOpenChange(false);
    setLine(""); setArea(""); setPincode(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add address</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {["Home", "Work", "Other"].map((l) => (
              <button key={l} onClick={() => setLabel(l)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  label === l ? "border-primary bg-primary text-primary-foreground" : "border-border"
                }`}>{l}</button>
            ))}
          </div>
          <div><Label>Flat / House / Street</Label><Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="A-203, Greens Apt" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Area</Label><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Sector 18" /></div>
            <div><Label>Pincode</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} maxLength={6} /></div>
          </div>
          <div><Label>Parking notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save address</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
