import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVehicleAudit, getVehicleTraceLog, type VehicleAuditRow } from "@/lib/audit.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, CheckCircle2, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/admin/vehicle-audit")({
  head: () => ({ meta: [{ title: "Vehicle Audit · Admin" }] }),
  component: VehicleAuditPage,
});

function VehicleAuditPage() {
  const router = useRouter();
  const auditFn = useServerFn(getVehicleAudit);
  const [tab, setTab] = useState<"all" | "mismatch">("all");
  const [search, setSearch] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["vehicle-audit", tab],
    queryFn: () => auditFn({ data: { scope: tab, limit: 500 } }),
  });

  const filtered = (data ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.customer_name ?? "").toLowerCase().includes(q) ||
      (r.booking_reg ?? "").toLowerCase().includes(q) ||
      (r.service_reg ?? "").toLowerCase().includes(q) ||
      r.service_id.includes(q) ||
      (r.booking_id ?? "").includes(q)
    );
  });

  const mismatchCount = (data ?? []).filter((r) => r.mismatch).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Vehicle Audit</h1>
          <p className="text-sm text-muted-foreground">
            Verify every scheduled service references the exact car chosen at booking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDevMode((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              devMode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Developer mode
          </button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.invalidate()}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "mismatch")}>
        <TabsList>
          <TabsTrigger value="all">All services</TabsTrigger>
          <TabsTrigger value="mismatch">
            Mismatches
            {tab !== "mismatch" && mismatchCount > 0 && (
              <Badge variant="destructive" className="ml-2">{mismatchCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="my-3">
          <Input
            placeholder="Search by customer or registration…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm rounded-full"
          />
        </div>

        <TabsContent value={tab} className="mt-0">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2">Partner vehicle</th>
                  <th className="px-3 py-2">Service date</th>
                  {devMode && <th className="px-3 py-2">Booking ID</th>}
                  {devMode && <th className="px-3 py-2">Service ID</th>}
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr><td colSpan={devMode ? 8 : 6} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isFetching && filtered.length === 0 && (
                  <tr><td colSpan={devMode ? 8 : 6} className="px-3 py-6 text-center text-muted-foreground">No rows.</td></tr>
                )}
                {filtered.map((r) => (
                  <Row key={r.service_id} row={r} devMode={devMode} onOpen={() => setOpenBookingId(r.booking_id)} />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <TraceSheet bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />
    </div>
  );
}

function Row({ row, devMode, onOpen }: { row: VehicleAuditRow; devMode: boolean; onOpen: () => void }) {
  const bookingLabel = row.booking_id
    ? `${row.booking_make ?? "?"} ${row.booking_model ?? ""} · ${row.booking_reg ?? "—"}`
    : "—";
  const serviceLabel = `${row.service_make ?? "?"} ${row.service_model ?? ""} · ${row.service_reg ?? "—"}`;
  return (
    <tr className={row.mismatch ? "bg-destructive/5" : ""}>
      <td className="px-3 py-2">{row.customer_name ?? "—"}</td>
      <td className="px-3 py-2">{bookingLabel}</td>
      <td className="px-3 py-2">{serviceLabel}</td>
      <td className="whitespace-nowrap px-3 py-2">{row.scheduled_date ?? "—"}</td>
      {devMode && <td className="px-3 py-2 font-mono text-xs">{row.booking_id?.slice(0, 8) ?? "—"}</td>}
      {devMode && <td className="px-3 py-2 font-mono text-xs">{row.service_id.slice(0, 8)}</td>}
      <td className="px-3 py-2">
        {row.mismatch ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Mismatch
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> OK
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {row.booking_id && (
          <Button variant="ghost" size="sm" onClick={onOpen}>Trace</Button>
        )}
      </td>
    </tr>
  );
}


function TraceSheet({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const traceFn = useServerFn(getVehicleTraceLog);
  const { data, isFetching } = useQuery({
    queryKey: ["vehicle-trace", bookingId],
    queryFn: () => traceFn({ data: { booking_id: bookingId!, limit: 200 } }),
    enabled: !!bookingId,
  });
  return (
    <Sheet open={!!bookingId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Trace for booking {bookingId?.slice(0, 8)}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto">
          {isFetching && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isFetching && (data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No trace events for this booking.</p>
          )}
          {(data ?? []).map((e: any) => (
            <div key={e.id} className="rounded-md border border-border p-2 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{e.source}</span>
                <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 font-mono">
                <div>vehicle: {e.vehicle_id?.slice(0, 8) ?? "—"}</div>
                <div>service: {e.service_id?.slice(0, 8) ?? "—"}</div>
                <div>customer: {e.customer_id?.slice(0, 8) ?? "—"}</div>
                <div>actor: {e.actor_user_id?.slice(0, 8) ?? "—"}</div>
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(e.payload, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
