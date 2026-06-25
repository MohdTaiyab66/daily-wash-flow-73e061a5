import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getMarketplaceQueueDetail,
  adminCancelQueue,
  adminRetryQueue,
  adminForceAssignQueue,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Loader2, RefreshCw, XCircle, UserCheck, Search, MapPin, Clock, Circle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/marketplace/$id")({
  component: MarketplaceDetailPage,
});

function MarketplaceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getMarketplaceQueueDetail);
  const cancelFn = useServerFn(adminCancelQueue);
  const retryFn = useServerFn(adminRetryQueue);
  const forceFn = useServerFn(adminForceAssignQueue);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-marketplace-detail", id],
    queryFn: () => getFn({ data: { queue_id: id } }),
    refetchInterval: 10000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`admin-marketplace-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_assignment_queue", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["admin-marketplace-detail", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_offers", filter: `queue_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["admin-marketplace-detail", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-marketplace-detail", id] });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelFn({ data: { queue_id: id, reason } }),
    onSuccess: () => { toast.success("Queue cancelled"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });
  const retryMut = useMutation({
    mutationFn: () => retryFn({ data: { queue_id: id } }),
    onSuccess: () => { toast.success("Retrying — fresh offer dispatched"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });
  const forceMut = useMutation({
    mutationFn: (partner_id: string) => forceFn({ data: { queue_id: id, partner_id } }),
    onSuccess: () => { toast.success("Partner assigned manually"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Force-assign failed"),
  });

  const [search, setSearch] = useState("");
  const suggested = useMemo(() => {
    const list = data?.suggested ?? [];
    const term = search.trim().toLowerCase();
    const filtered = !term ? list : list.filter((p: any) =>
      [p.full_name, p.phone, p.partner_code, p.home_area].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(term))
    );
    return filtered.slice(0, 30);
  }, [data?.suggested, search]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="inline mr-2 h-4 w-4 animate-spin" />Loading…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Queue entry not found.</div>;

  const q: any = data.queue;
  const isClosed = q.status === "assigned" || q.status === "cancelled" || q.status === "failed";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost"><Link to="/admin/marketplace"><ArrowLeft className="mr-1 h-4 w-4" />Back to marketplace</Link></Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Daily Shine queue</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {data.customer?.full_name ?? "Customer"} · {q.area ?? "—"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Created {new Date(q.created_at).toLocaleString("en-IN")} · {q.vehicle_category ?? "—"} · radius {q.radius_km ?? 2}km
              {q.service_required_before && <> · needed before {q.service_required_before}</>}
            </p>
          </div>
          <Badge variant={q.status === "assigned" ? "default" : q.status === "cancelled" || q.status === "failed" ? "destructive" : "secondary"} className="capitalize">
            {q.status}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => retryMut.mutate()}
            disabled={isClosed || retryMut.isPending}
          >
            {retryMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const reason = window.prompt("Reason for cancelling this queue (optional)") ?? undefined;
              if (reason !== null) cancelMut.mutate(reason ?? "");
            }}
            disabled={isClosed || cancelMut.isPending}
          >
            {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
            Cancel queue
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
          <div className="mt-2 space-y-1 text-sm">
            <p className="font-medium">{data.customer?.full_name ?? "—"}</p>
            <p className="text-muted-foreground">+91 {data.customer?.phone ?? "—"}</p>
            <p className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{data.customer?.address ?? data.customer?.area ?? "—"}</p>
            {data.customer?.registration_number && <p className="text-muted-foreground">Plate: {data.customer.registration_number}</p>}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booking</p>
          {data.booking ? (
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-medium">{(data.booking as any).plan_type ?? "Daily Shine"} · ₹{(data.booking as any).total_amount ?? 0}</p>
              <p className="text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Starts {(data.booking as any).scheduled_date ?? "—"} · before {(data.booking as any).preferred_before_time ?? "—"}</p>
              <p className="text-muted-foreground">Status: {(data.booking as any).status}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No linked booking.</p>
          )}
        </Card>
      </div>

      {data.assignedPartner && (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned partner</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">{(data.assignedPartner as any).full_name}</p>
              <p className="text-muted-foreground">{(data.assignedPartner as any).partner_code} · ⭐ {Number((data.assignedPartner as any).rating_avg ?? 0).toFixed(1)} · {(data.assignedPartner as any).home_area ?? "—"}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/partner-assignment/$id" params={{ id: (data.assignedPartner as any).id }}>Open assignment</Link>
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offer history ({(data.offers ?? []).length})</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Partner</th><th>Scope</th><th>Offered</th><th>Score</th><th>Route Δ</th><th>+₹/day</th><th>Response</th>
              </tr>
            </thead>
            <tbody>
              {(data.offers ?? []).map((o: any) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="py-2 font-medium">{o.partner?.full_name ?? o.partner_id.slice(0, 8)}</td>
                  <td className="text-muted-foreground capitalize">{o.scope}</td>
                  <td className="text-muted-foreground">{new Date(o.offered_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>{o.score != null ? Number(o.score).toFixed(1) : "—"}</td>
                  <td className="text-muted-foreground">{o.route_delta_seconds ? `+${Math.round(o.route_delta_seconds / 60)}m` : "—"}</td>
                  <td className="text-muted-foreground">{o.extra_per_day_paise ? `₹${Math.round(o.extra_per_day_paise / 100)}` : "—"}</td>
                  <td>
                    <Badge variant={o.response === "accepted" ? "default" : o.response === "pending" ? "secondary" : "outline"} className="capitalize">
                      {o.response}
                    </Badge>
                  </td>
                </tr>
              ))}
              {(data.offers ?? []).length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No offers dispatched yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!isClosed && (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Manual assign · pick a partner</p>
          <p className="mt-1 text-xs text-muted-foreground">Bypasses the offer flow. The partner is added directly and the customer is notified.</p>
          <div className="mt-3 relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, phone, code, area…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-3 divide-y divide-border">
            {suggested.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {p.full_name}
                    <Circle className={`h-2 w-2 ${p.is_online ? "fill-success text-success" : "fill-muted text-muted"}`} />
                    {p.same_area && <Badge variant="secondary" className="text-[10px]">Same area</Badge>}
                    {p.previously_offered && <Badge variant="outline" className="text-[10px]">Already offered</Badge>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{p.partner_code} · +91 {p.phone} · {p.home_area ?? "—"} · ⭐ {Number(p.rating_avg ?? 0).toFixed(1)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={forceMut.isPending}
                  onClick={() => {
                    if (confirm(`Force-assign ${p.full_name} to this customer?`)) forceMut.mutate(p.id);
                  }}
                >
                  <UserCheck className="mr-1 h-3.5 w-3.5" />Assign
                </Button>
              </div>
            ))}
            {suggested.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No partners match.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
