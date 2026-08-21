import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAssignPartnerToBooking,
  listAdminPartnersBrief,
  getAdminBookingForAssignment,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Loader2, Search, UserCheck, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/admin/assign-booking/$id")({
  component: AssignBookingPage,
});

function AssignBookingPage() {
  const { id: bookingId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listPartners = useServerFn(listAdminPartnersBrief);
  const assignFn = useServerFn(adminAssignPartnerToBooking);
  const resolveBooking = useServerFn(getAdminBookingForAssignment);

  const [partnerId, setPartnerId] = useState("");
  const [search, setSearch] = useState("");

  const { data: resolverResult, isLoading: loadingBooking, error: bookingError } = useQuery({
    queryKey: ["admin-booking-detail-resolver", bookingId],
    queryFn: async () => {
      console.log(`[ADMIN-BOOKING-PAGE] Requesting resolution for: ${bookingId}`);
      const result = await resolveBooking({ data: { booking_id: bookingId } });
      
      // Secondary check for RLS issues if the server function works but client direct doesn't
      // We also check current user to log forensics
      const { data: { user } } = await supabase.auth.getUser();
      console.log(`[ADMIN-BOOKING-PAGE] Current user: ${user?.id} (${user?.email})`);
      
      return result;
    },
  });

  const { data: partners } = useQuery({ 
    queryKey: ["partners-brief"], 
    queryFn: () => listPartners() 
  });

  const booking = resolverResult?.found ? resolverResult.data : null;

  const filteredPartners = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (partners ?? []) as any[];
    const areaMatch = (booking as any)?.customers?.area;
    
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
  }, [partners, search, (booking as any)?.customers?.area]);

  const mut = useMutation({
    mutationFn: () => assignFn({ data: { booking_id: bookingId, partner_id: partnerId } }),
    onSuccess: () => {
      toast.success("Partner assigned successfully");
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-booking-detail-resolver", bookingId] });
      navigate({ to: "/admin/notifications" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Assignment failed"),
  });

  if (loadingBooking) return <div className="p-12 text-center flex flex-col items-center gap-4">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="text-muted-foreground">Resolving booking status...</span>
  </div>;

  if (bookingError) {
    return (
      <Card className="m-8 p-12 border-destructive/20 bg-destructive/5 text-center flex flex-col items-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Resolution Error</h2>
        <p className="text-muted-foreground">The system encountered an error while trying to resolve the booking.</p>
        <code className="bg-background p-2 rounded text-xs font-mono">{String(bookingError)}</code>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </Card>
    );
  }

  if (!resolverResult?.found) {
    return (
      <Card className="m-8 p-12 border-orange-500/20 bg-orange-500/5 text-center flex flex-col items-center gap-4">
        <Search className="h-12 w-12 text-orange-500" />
        <h2 className="text-xl font-bold">Booking Not Found</h2>
        <p className="text-muted-foreground max-w-md">
          The booking ID <span className="font-mono bg-background px-1 rounded">{bookingId}</span> does not exist in the authoritative database.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" asChild><Link to="/admin/notifications">Back to Notifications</Link></Button>
          <Button onClick={() => window.location.reload()}>Refresh Check</Button>
        </div>
      </Card>
    );
  }

  const customer = (booking as any).customers;

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
              <DetailRow label="Booking ID" value={<span className="font-mono text-[10px]">{(booking as any).id}</span>} />
              <DetailRow label="Customer" value={customer?.full_name} />
              <DetailRow label="Service" value={(booking as any).service_catalog?.name || (booking as any).service_type?.replace("_", " ")} />
              <DetailRow label="Amount" value={`₹${(booking as any).total_amount}`} />
              <DetailRow label="Area" value={customer?.area} />
              <DetailRow label="Phone" value={customer?.phone ? `+91 ${customer.phone}` : "—"} />
              <DetailRow label="Payment" value={<Badge variant={(booking as any).payment_status === "paid" ? "secondary" : "destructive"} className="capitalize">{(booking as any).payment_status}</Badge>} />
              <DetailRow label="Status" value={<Badge variant="outline" className="capitalize">{(booking as any).status}</Badge>} />
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
