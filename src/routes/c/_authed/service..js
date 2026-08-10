import { z } from "zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Car, MapPin, Calendar, Sparkles, Loader2, ChevronRight, Minus, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger, } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { Section, Surface, PageTitle, Muted } from "@/components/customer/ui/kit";
export const Route = createFileRoute("/c/_authed/service/")({
    ssr: false,
    head: () => ({ meta: [{ title: "Book a Wash — Urban Wash" }] }),
    validateSearch: z.object({
        slug: z.string().optional().catch(undefined),
    }),
    component: ServiceBookingPage,
});
const TIME_SLOTS = ["06:00 - 09:00", "09:00 - 12:00", "12:00 - 15:00", "15:00 - 18:00"];
function ServiceBookingPage() {
    const { slug } = Route.useSearch();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [vehicleId, setVehicleId] = useState(localStorage.getItem("uw_customer_vehicle") || null);
    const [addressId, setAddressId] = useState(null);
    const [date, setDate] = useState("");
    const [slot, setSlot] = useState(TIME_SLOTS[0]);
    const [notes, setNotes] = useState("");
    const [addonQty, setAddonQty] = useState({});
    const [addrOpen, setAddrOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [confirmError, setConfirmError] = useState(null);
    const serviceQ = useQuery({
        queryKey: ["service", slug],
        queryFn: async () => {
            const { data, error } = await supabase.from("service_catalog").select("*").eq("slug", slug || "").single();
            if (error)
                throw error;
            return data;
        },
        enabled: !!slug,
    });
    const vehiclesQ = useQuery({
        queryKey: ["customer-vehicles"],
        queryFn: async () => {
            const { data } = await supabase.from("customer_vehicles").select("*");
            return data || [];
        },
    });
    const addressesQ = useQuery({
        queryKey: ["customer-addresses"],
        queryFn: async () => {
            const { data } = await supabase.from("customer_addresses").select("*");
            return data || [];
        },
    });
    const addonsQ = useQuery({
        queryKey: ["service-addons", serviceQ.data?.id],
        queryFn: async () => {
            const { data } = await supabase.from("service_catalog").select("*").eq("category", "addon").eq("active", true);
            // Note: Filtering by applies_to_slugs if needed, or keeping it simple for now
            return (data || []).filter(a => a.category === "addon");
        },
        enabled: !!serviceQ.data?.id,
    });
    const vehicle = vehiclesQ.data?.find((v) => v.id === vehicleId) || vehiclesQ.data?.[0];
    const isSUV = vehicle?.category === "sedan_suv";
    const service = serviceQ.data;
    // Pricing calculation
    const previewBase = isSUV ? service?.price_sedan_suv : service?.price_hatchback;
    const previewAddon = useMemo(() => {
        return (addonsQ.data || []).reduce((acc, a) => {
            const q = addonQty[a.id] || 0;
            const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
            return acc + (p * q);
        }, 0);
    }, [addonsQ.data, addonQty, isSUV]);
    const previewPayable = (Number(previewBase) || 0) + previewAddon;
    useEffect(() => {
        if (vehiclesQ.data?.length && !vehicleId) {
            setVehicleId(vehiclesQ.data[0].id);
        }
    }, [vehiclesQ.data, vehicleId]);
    useEffect(() => {
        if (addressesQ.data?.length && !addressId) {
            setAddressId(addressesQ.data[0].id);
        }
    }, [addressesQ.data, addressId]);
    useEffect(() => {
        if (!date) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            setDate(tomorrow.toISOString().split("T")[0]);
        }
    }, [date]);
    const setQty = (id, q) => {
        setAddonQty((prev) => ({ ...prev, [id]: Math.max(0, q) }));
    };
    const confirm = async () => {
        if (!vehicle || !addressId || !date || !slot) {
            toast.error("Please select all required details");
            return;
        }
        setSubmitting(true);
        setConfirmError(null);
        try {
            const { data: bookingId, error } = await supabase.rpc("confirm_customer_booking", {
                p_service_id: service?.id,
                p_vehicle_id: vehicle.id,
                p_address_id: addressId,
                p_scheduled_date: date,
                p_scheduled_time: slot,
                p_notes: notes || null,
                p_addons: Object.keys(addonQty).filter(k => addonQty[k] > 0).map(k => ({ id: k, qty: addonQty[k] })),
            });
            if (error)
                throw error;
            await navigate({
                to: "/c/booking-success",
                search: {
                    bookingId: String(bookingId),
                    service: service?.name,
                    date,
                    slot,
                    vehicle: `${vehicle.make} ${vehicle.model}`,
                },
            });
        }
        catch (err) {
            setConfirmError(err.message || "Failed to create booking");
            toast.error(err.message || "Failed to create booking");
        }
        finally {
            setSubmitting(false);
        }
    };
    const uniqueAddresses = useMemo(() => {
        const seen = new Set();
        return (addressesQ.data ?? []).filter((addr) => {
            const key = `${addr.address_line.trim().toLowerCase()}|${addr.area.trim().toLowerCase()}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }, [addressesQ.data]);
    if (serviceQ.isLoading) {
        return <div className="px-5 pt-10"><div className="h-40 animate-pulse rounded-2xl bg-muted"/></div>;
    }
    if (!service) {
        return (<div className="px-5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Service not found.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/c/home">Back to home</Link></Button>
      </div>);
    }
    return (<div className="min-h-screen bg-[#FFF9F3] pb-32">
      <header className="sticky top-0 z-20 flex items-center gap-4 bg-[#FFF9F3]/95 px-5 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/c/home" })} className="grid h-9 w-9 place-items-center rounded-full bg-card shadow-sm transition-transform active:scale-90">
          <ArrowLeft className="h-4 w-4"/>
        </button>
        <div className="min-w-0">
          <PageTitle>{service.name}</PageTitle>
          <Muted className="truncate">Schedule your wash</Muted>
        </div>
      </header>

      <div className="px-5 pb-6">
        <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED]">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-[20px] font-black text-foreground">{service.name}</h2>
              <p className="mt-1 text-[13px] font-medium text-muted-foreground/70">{service.description || "Premium doorstep car care"}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[28px] font-black text-primary">₹{previewPayable}</span>
              </div>
            </div>
          </div>
        </Surface>

        <Section title={<><Car className="h-4 w-4 text-primary"/> Your vehicle</>}>
          <Drawer>
            <DrawerTrigger asChild>
              <Surface className="flex items-center justify-between p-3 active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center">
                    <Car className="h-6 w-6 text-primary"/>
                  </div>
                  <div>
                    <div className="text-[14px] font-black">{vehicle?.make} {vehicle?.model || "Select Car"}</div>
                    <div className="text-[12px] font-medium text-muted-foreground/60">{vehicle?.registration_number || "No vehicle selected"}</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground"/>
              </Surface>
            </DrawerTrigger>
            <DrawerContent className="max-h-[80vh]">
              <DrawerHeader><DrawerTitle>Select Vehicle</DrawerTitle></DrawerHeader>
              <div className="px-4 py-2 space-y-2 overflow-y-auto">
                {vehiclesQ.data?.map(v => (<DrawerClose key={v.id} asChild>
                    <button onClick={() => setVehicleId(v.id)} className={cn("w-full text-left p-4 rounded-xl border flex items-center justify-between", vehicleId === v.id ? "border-primary bg-primary/5 shadow-sm" : "border-black/5")}>
                      <div>
                        <div className="font-black text-[15px]">{v.make} {v.model}</div>
                        <div className="text-xs font-medium text-muted-foreground/60">{v.registration_number}</div>
                      </div>
                      {vehicleId === v.id && <div className="h-2 w-2 rounded-full bg-primary"/>}
                    </button>
                  </DrawerClose>))}
              </div>
              <DrawerFooter>
                <Button asChild variant="outline" className="w-full h-12 rounded-xl font-bold border-black/5 transition-transform active:scale-95"><Link to="/c/vehicles/add">Add another car</Link></Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </Section>

        <Section title={<><MapPin className="h-4 w-4 text-primary"/> Service location</>}>
          <Drawer>
            <DrawerTrigger asChild>
              <Surface className="flex items-start gap-3 p-3 active:scale-[0.98] transition-transform">
                <div className="mt-1 h-5 w-5 rounded-full border-2 border-primary/20 bg-primary/10 flex items-center justify-center shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary"/>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-black">
                    {uniqueAddresses.find(a => a.id === addressId)?.label ?? "Default Location"}
                  </div>
                  <div className="text-[12px] font-medium text-muted-foreground/60 truncate">
                    {uniqueAddresses.find(a => a.id === addressId)?.address_line ?? "Select your address"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1"/>
              </Surface>
            </DrawerTrigger>
            <DrawerContent className="max-h-[80vh]">
              <DrawerHeader><DrawerTitle>Select Location</DrawerTitle></DrawerHeader>
              <div className="px-4 py-2 space-y-2 overflow-y-auto">
                {uniqueAddresses.map(addr => (<DrawerClose key={addr.id} asChild>
                    <button onClick={() => setAddressId(addr.id)} className={cn("w-full text-left p-4 rounded-xl border", addressId === addr.id ? "border-primary bg-primary/5" : "border-black/5")}>
                      <div className="font-black text-[15px]">{addr.label}</div>
                      <div className="text-xs font-medium text-muted-foreground/60">{addr.address_line}, {addr.area}</div>
                    </button>
                  </DrawerClose>))}
              </div>
              <DrawerFooter>
                <Button onClick={() => setAddrOpen(true)} variant="outline" className="h-12 rounded-xl font-bold border-black/5 transition-transform active:scale-95">Add new address</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </Section>

        <Section title={<><Calendar className="h-4 w-4 text-primary"/> Pick a date</>}>
          <div className="mb-4 text-[14px] font-black text-foreground px-1 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground"/>
            {date === new Date().toISOString().split("T")[0] ? "Today" : "Tomorrow"} · {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((s) => (<button key={s} onClick={() => setSlot(s)} className={cn("rounded-xl border py-3 text-[12px] font-black transition-all active:scale-95", slot === s ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-black/5 bg-white text-muted-foreground")}>
                {s}
              </button>))}
          </div>
        </Section>

        <Section title={<><Sparkles className="h-4 w-4 text-primary"/> Add extras</>}>
          <div className="space-y-2">
            {addonsQ.data?.map((a) => {
            const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
            const qty = addonQty[a.id] || 0;
            return (<div key={a.id} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black text-[#1a1a1a]">{a.name}</div>
                    <div className="text-[12px] font-medium text-muted-foreground/60">₹{p}</div>
                  </div>
                  <div className="ml-4 shrink-0">
                    {qty > 0 ? (<div className="flex items-center gap-2 bg-primary/5 rounded-full p-1 border border-primary/20 shadow-inner">
                        <button onClick={() => setQty(a.id, qty - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white border border-black/5 shadow-sm active:scale-90 transition-transform"><Minus className="h-3 w-3"/></button>
                        <span className="text-[13px] font-black w-4 text-center">{qty}</span>
                        <button onClick={() => setQty(a.id, qty + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white border border-black/5 shadow-sm active:scale-90 transition-transform"><Plus className="h-3 w-3"/></button>
                      </div>) : (<Button size="sm" variant="outline" className="rounded-full h-9 px-5 font-black border-primary/20 text-primary hover:bg-primary/5 active:scale-95 transition-transform" onClick={() => setQty(a.id, 1)}>+ Add</Button>)}
                  </div>
                </div>);
        })}
          </div>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-5 pt-4 pb-8 backdrop-blur shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
        <div className="mx-auto max-w-md">
          {confirmError && <div className="mb-3 text-[11px] font-bold text-destructive text-center">{confirmError}</div>}
          <Button size="lg" className="h-16 w-full rounded-2xl text-[17px] font-black shadow-lg shadow-primary/20 animate-in slide-in-from-bottom-2 duration-500 active:scale-[0.98] transition-transform" onClick={confirm} disabled={submitting}>
            {submitting ? (<Loader2 className="mr-2 h-6 w-6 animate-spin"/>) : (<div className="flex w-full items-center justify-between px-2">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[13px] opacity-70 font-medium">Total Payable</span>
                  <span className="text-[18px]">₹{previewPayable}</span>
                </div>
                <div className="flex items-center gap-1 font-black">
                  Book Wash <ChevronRight className="h-5 w-5"/>
                </div>
              </div>)}
          </Button>
        </div>
      </div>

      <AddressDialog open={addrOpen} onOpenChange={setAddrOpen} onCreated={(id) => { setAddressId(id); qc.invalidateQueries({ queryKey: ["customer-addresses"] }); }}/>
    </div>);
}
function AddressDialog({ open, onOpenChange, onCreated }) {
    const [label, setLabel] = useState("Home");
    const [line, setLine] = useState("");
    const [area, setArea] = useState("");
    const [pincode, setPincode] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const save = async () => {
        if (line.trim().length < 4) {
            toast.error("Enter a valid address");
            return;
        }
        setSaving(true);
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) {
            setSaving(false);
            return;
        }
        const { data, error } = await supabase.from("customer_addresses").insert({
            user_id: u.user.id, label, address_line: line.trim(), area: area.trim(),
            pincode: pincode || null, parking_notes: notes || null,
            latitude: 0, longitude: 0, is_default: true,
        }).select("id").single();
        setSaving(false);
        if (error) {
            toast.error(error.message);
            return;
        }
        toast.success("Address saved");
        onCreated(data.id);
        onOpenChange(false);
    };
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[32px] border-none shadow-2xl">
        <DialogHeader className="pb-2"><DialogTitle className="text-xl font-black">Add new address</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex gap-2 p-1 bg-black/5 rounded-2xl">
            {["Home", "Work", "Other"].map((l) => (<button key={l} onClick={() => setLabel(l)} className={cn("flex-1 py-2.5 text-[13px] font-black rounded-xl transition-all", label === l ? "bg-white text-primary shadow-sm" : "text-muted-foreground/60")}>{l}</button>))}
          </div>
          <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Flat / House / Street</Label><Input value={line} className="h-12 rounded-xl bg-black/5 border-none" onChange={(e) => setLine(e.target.value)} placeholder="A-203, Greens Apt"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Area</Label><Input value={area} className="h-12 rounded-xl bg-black/5 border-none" onChange={(e) => setArea(e.target.value)} placeholder="Sector 18"/></div>
            <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Pincode</Label><Input value={pincode} className="h-12 rounded-xl bg-black/5 border-none" onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} maxLength={6} placeholder="400001"/></div>
          </div>
          <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Parking notes (optional)</Label><Textarea value={notes} className="rounded-xl bg-black/5 border-none min-h-[80px]" onChange={(e) => setNotes(e.target.value)} placeholder="Wait at the gate..."/></div>
        </div>
        <DialogFooter className="pt-4 sm:justify-between gap-3">
          <Button variant="ghost" className="h-12 rounded-xl font-black text-muted-foreground transition-transform active:scale-95" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} className="h-12 rounded-xl font-black px-8 transition-transform active:scale-95" disabled={saving}>{saving ? <Loader2 className="h-5 w-5 animate-spin"/> : "Save address"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
