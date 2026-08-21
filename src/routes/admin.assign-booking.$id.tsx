import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAssignPartnerToBooking,
  listAdminPartnersBrief,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Loader2, Search, UserCheck } from "lucide-react";

export const Route = createFileRoute("/admin/assign-booking/$id")({
  component: AssignBookingPage,
});

function AssignBookingPage() {
  const { id: bookingId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listPartners = useServerFn(listAdminPartnersBrief);
  const assignFn = useServerFn(adminAssignPartnerToBooking);

  const [partnerId, setPartnerId] = useState("");
  const [search, setSearch] = useState("");

  const { data: booking, isLoading: loadingBooking, error: bookingError } = useQuery({
    queryKey: ["admin-booking-detail", bookingId],
    queryFn: async () => {
      console.log(`[ADMIN-BOOKING-E2E] Fetching booking ID: ${bookingId}`);
      
      // Use the newly created view for robust joining without FK constraints
      const { data, error } = await supabase
        .from("admin_booking_details")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();

      if (error) {
        console.error(`[ADMIN-BOOKING-E2E] DB Error:`, error);
        throw error;
      }
      
      if (!data) {
        console.warn(`[ADMIN-BOOKING-E2E] No booking found for ID: ${bookingId}`);
        // Forensic check: does it exist in the raw table?
        const { count } = await supabase.from("bookings").select("id", { count: 'exact', head: true }).eq("id", bookingId);
        console.log(`[ADMIN-BOOKING-E2E] Raw table existence check count: ${count}`);
        return null;
      }

      console.log(`[ADMIN-BOOKING-E2E] Found booking:`, data);
      
      // Map view fields to expected object structure for compatibility
      return {
        ...data,
        customers: {
          full_name: data.customer_name,
          phone: data.customer_phone,
          area: data.customer_area,
          address_line: data.customer_address
        },
        service_catalog: {
          name: data.service_name,
          category: data.service_category
        }
      } as any;
    },
  });

  const { data: partners } = useQuery({ 
    queryKey: ["partners-brief"], 
    queryFn: () => listPartners() 
  });

  const filteredPartners = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (partners ?? []) as any[];
    const areaMatch = booking?.customers?.area;
    
    let result = list;
    if (term) {
      result = result.filter((p: any) =>
        [p.full_name, p.phone, p.home_area].filter(Boolean).some((v: any) => String(v).toLowerCase().includes(term))
      );
    }
    
    return result.sort((a, b) => {
      const aMatch = a.home_area === areaMatch ? 1 : 0;
      const bMatch = b.home_area === areaMatch ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [partners, search, booking?.customers?.area]);

  const mut = useMutation({
    mutationFn: () => assignFn({ data: { booking_id: bookingId, partner_id: partnerId } }),
    onSuccess: () => {
      toast.success("Partner assigned successfully");
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-booking-detail", bookingId] });
      navigate({ to: "/admin/notifications" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Assignment failed"),
  });

  if (loadingBooking) return <div className="p-8 text-center text-muted-foreground">Loading booking...</div>;
  if (!booking) return <div className="p-8 text-center text-muted-foreground">Booking not found</div>;

  const customer = booking.customers;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/notifications"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
        </Button>
        <h1 className="text-2xl font-bold">Assign Partner</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-4">
          <Card className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Booking Details</h3>
            <div className="space-y-3">
              <DetailRow label="Booking ID" value={<span className="font-mono text-[10px]">{booking.id}</span>} />
              <DetailRow label="Customer" value={customer?.full_name} />
              <DetailRow label="Service" value={booking.service_catalog?.name || booking.service_type?.replace("_", " ")} />
              <DetailRow label="Amount" value={`₹${booking.total_amount}`} />
              <DetailRow label="Area" value={customer?.area} />
              <DetailRow label="Phone" value={customer?.phone ? `+91 ${customer.phone}` : "—"} />
              <DetailRow label="Payment" value={<Badge variant={booking.payment_status === "paid" ? "secondary" : "destructive"} className="capitalize">{booking.payment_status}</Badge>} />
              <DetailRow label="Status" value={<Badge variant="outline" className="capitalize">{booking.status}</Badge>} />
            </div>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Choose Partner</h3>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search partners..." 
                  className="pl-9 h-9 text-xs" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
            </div>

            <div className="grid gap-2 max-h-[500px] overflow-y-auto">
              {filteredPartners.map((p: any) => {
                const active = p.id === partnerId;
                const isAreaMatch = p.home_area === customer?.area;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPartnerId(p.id)}
                    className={`flex items-center gap-3 p-3 text-left rounded-xl border transition-all ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {p.full_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{p.full_name}</span>
                        {isAreaMatch && <Badge variant="secondary" className="text-[9px] h-4">Area Match</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">+91 {p.phone} · {p.home_area || "No area"}</p>
                    </div>
                    {active && <Check className="h-5 w-5 text-primary" />}
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Button 
              size="lg" 
              className="rounded-full px-8" 
              disabled={!partnerId || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Assign Partner
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
