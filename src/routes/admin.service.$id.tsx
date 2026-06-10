import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminServiceDetail } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, MapPin, Timer } from "lucide-react";

export const Route = createFileRoute("/admin/service/$id")({
  component: ServiceDetailAdmin,
});

function ServiceDetailAdmin() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAdminServiceDetail);
  const { data } = useQuery({ queryKey: ["admin-service", id], queryFn: () => fn({ data: { service_id: id } }) });

  if (!data?.service) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const s: any = data.service;
  const c = s.customers;
  const v = s.vehicles;
  const p = s.partners;
  const duration =
    s.started_at && s.completed_at
      ? Math.round((Date.parse(s.completed_at) - Date.parse(s.started_at)) / 60000)
      : null;
  const before = data.photos.find((x: any) => x.stage === "before");
  const after = data.photos.filter((x: any) => x.stage === "after");

  return (
    <div>
      <Link to="/admin/services" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to services
      </Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{c?.full_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
          <p className="text-xs text-muted-foreground">{c?.address_line}, {c?.area}</p>
          <p className="text-xs text-muted-foreground">Customer phone: +91 {c?.phone}</p>
        </div>
        <Badge variant="outline" className="capitalize">{s.status?.replace("_", " ")}</Badge>
      </div>

      <Card className="mt-5 grid gap-3 p-5 sm:grid-cols-4">
        <Info label="Partner" value={p ? `${p.full_name} (${p.partner_code})` : "—"} />
        <Info label="Scheduled" value={s.scheduled_date} />
        <Info label="Started" value={s.started_at ? new Date(s.started_at).toLocaleString() : "—"} />
        <Info label="Completed" value={s.completed_at ? new Date(s.completed_at).toLocaleString() : "—"} />
        <Info label="Duration" value={duration ? `${duration} min` : "—"} />
        <Info label="Start GPS" value={s.start_lat ? `${Number(s.start_lat).toFixed(4)}, ${Number(s.start_lng).toFixed(4)}` : "—"} />
        <Info label="Complete GPS" value={s.complete_lat ? `${Number(s.complete_lat).toFixed(4)}, ${Number(s.complete_lng).toFixed(4)}` : "—"} />
        <Info label="Rate" value={`₹${s.rate_per_car}`} />
      </Card>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {before ? <PhotoCard p={before} /> : <p className="text-sm text-muted-foreground">No before photo.</p>}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">After (4 angles)</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {after.length === 0 && <p className="text-sm text-muted-foreground">No after photos.</p>}
        {after.map((ph: any) => <PhotoCard key={ph.id} p={ph} />)}
      </div>

      {s.status === "unavailable" && (
        <Card className="mt-8 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Unavailable report</h2>
          <p className="mt-2 text-sm">Reason: {s.unavailable_reason}</p>
          {s.unavailable_notes && <p className="mt-1 text-xs text-muted-foreground">{s.unavailable_notes}</p>}
        </Card>
      )}

      {data.dirty.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dirty vehicle reports</h2>
          {data.dirty.map((r: any) => (
            <Card key={r.id} className="mt-2 p-5">
              <p className="text-sm font-medium">{r.reason}</p>
              {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {(["front", "rear", "left", "right"] as const).map((a) => {
                  const url = r[`photo_${a}_url`];
                  return (
                    <div key={a}>
                      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{a}</p>
                      {url ? <img src={url} alt={a} className="aspect-square w-full rounded-md object-cover" /> : <div className="aspect-square w-full rounded-md bg-muted" />}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </>
      )}

      {data.parking.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Parking reports</h2>
          {data.parking.map((r: any) => (
            <Card key={r.id} className="mt-2 p-5">
              <p className="text-sm font-medium">{r.reason}</p>
              {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
              {r.photo_url && <img src={r.photo_url} alt="parking" className="mt-3 max-w-sm rounded-md" />}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function PhotoCard({ p }: { p: any }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {p.signed_url ? (
        <img src={p.signed_url} alt={p.angle} className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">No image</div>
      )}
      <div className="space-y-1 p-2 text-[11px] text-muted-foreground">
        <p className="font-medium capitalize text-foreground">{p.stage} · {p.angle}</p>
        <p className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(p.captured_at).toLocaleString()}</p>
        {p.lat && p.lng && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{Number(p.lat).toFixed(4)}, {Number(p.lng).toFixed(4)}</p>}
      </div>
    </div>
  );
}
