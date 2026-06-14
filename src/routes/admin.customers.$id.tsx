import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerProfile } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExtendCustomerDialog } from "@/components/ExtendCustomerDialog";
import { MonthlyWashTracker } from "@/components/MonthlyWashTracker";
import { ArrowLeft, Car, Phone, MapPin, Calendar, Clock, User as UserIcon, AlertTriangle, ParkingCircle, XCircle } from "lucide-react";


export const Route = createFileRoute("/admin/customers/$id")({
  component: CustomerProfilePage,
});

function CustomerProfilePage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getCustomerProfile);
  const { data, isLoading } = useQuery({
    queryKey: ["customer-profile", id],
    queryFn: () => fn({ data: { customer_id: id } }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Not found.</div>;

  const c = data.customer as any;
  const status = data.days_remaining == null ? "—" : data.days_remaining < 0 ? "Expired" : data.days_remaining <= 7 ? "Due soon" : "Active";
  const statusColor = status === "Expired" ? "destructive" : status === "Due soon" ? "secondary" : "default";

  return (
    <div>
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{c.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />+91 {c.phone}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.area}</span>
            <Badge variant={statusColor as any}>{status}</Badge>
          </div>
        </div>
        <ExtendCustomerDialog customerId={c.id} currentEnd={data.renewal_date} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Stat label="Start date" value={data.start_date ?? "—"} icon={<Calendar className="h-3.5 w-3.5" />} />
        <Stat label="Renewal date" value={data.renewal_date ?? "—"} icon={<Calendar className="h-3.5 w-3.5" />} />
        <Stat label="Days remaining" value={data.days_remaining == null ? "—" : `${data.days_remaining}`} icon={<Clock className="h-3.5 w-3.5" />} />
        <Stat label="Extension days" value={`${data.extension_days_total}`} icon={<Calendar className="h-3.5 w-3.5" />} />
        <Stat label="Last service" value={data.last_service_date ?? "—"} icon={<Clock className="h-3.5 w-3.5" />} />
        <Stat
          label="Assigned partner"
          value={data.assigned_partner ? `${(data.assigned_partner as any).full_name}` : "Unassigned"}
          icon={<UserIcon className="h-3.5 w-3.5" />}
        />
      </div>

      <Section title="Vehicles">
        <div className="grid gap-3 sm:grid-cols-2">
          {data.vehicles.length === 0 && <p className="text-sm text-muted-foreground">No vehicles.</p>}
          {data.vehicles.map((v: any) => (
            <Card key={v.id} className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><Car className="h-4 w-4" />{v.make} {v.model}</div>
              <p className="mt-1 text-xs text-muted-foreground">{v.registration_number}{v.color ? ` · ${v.color}` : ""}</p>
              {v.parking_notes && <p className="mt-2 text-xs text-muted-foreground">{v.parking_notes}</p>}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Monthly wash tracker">
        <MonthlyWashTracker customer={c} />
      </Section>



      <Section title={`Service photos (last 7 days · ${data.photos.length})`}>
        {data.photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos in the last 7 days.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {data.photos.map((p: any) => (
              <a key={p.id} href={p.signed_url ?? "#"} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border border-border bg-muted">
                {p.signed_url ? (
                  <img src={p.signed_url} alt={`${p.stage} ${p.angle}`} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="aspect-square w-full" />
                )}
                <div className="px-1.5 py-1 text-[10px] text-muted-foreground">
                  <Badge variant={p.stage === "after" ? "default" : "outline"} className="px-1 py-0 text-[9px]">{p.stage}</Badge>{" "}{p.angle}
                </div>
              </a>
            ))}
          </div>
        )}
      </Section>

      <Section title="Service history">
        <Card className="divide-y divide-border">
          {data.services.length === 0 && <p className="p-4 text-sm text-muted-foreground">No services yet.</p>}
          {data.services.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{s.scheduled_date}</p>
                <p className="text-xs text-muted-foreground">{s.time_slot}{s.partners ? ` · ${s.partners.full_name}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {s.gps_flag && s.gps_flag !== "ok" && <Badge variant="destructive" className="text-[10px]">{s.gps_flag}</Badge>}
                <Badge variant={s.status === "completed" ? "default" : s.status === "unavailable" ? "secondary" : "outline"}>{s.status}</Badge>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin/service/$id" params={{ id: s.id }}>View</Link>
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section title={`Complaints (${data.complaints.length})`}>
        {data.complaints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No complaints.</p>
        ) : (
          <div className="space-y-2">
            {data.complaints.map((c: any) => (
              <Card key={c.id} className="p-3 text-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <span className="font-medium">{c.category ?? "Complaint"}</span>
                  <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                {c.description && <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>}
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Unavailable reports (${data.unavailable_reports?.length ?? 0})`}>
        {!data.unavailable_reports?.length ? <p className="text-sm text-muted-foreground">None.</p> : (
          <Card className="divide-y divide-border">
            {data.unavailable_reports.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between p-3 text-sm">
                <div>
                  <p className="font-medium flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-destructive" />{r.unavailable_reason?.replace(/_/g, " ")}</p>
                  {r.unavailable_notes && <p className="mt-0.5 text-xs text-muted-foreground">{r.unavailable_notes}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.partners?.full_name ?? "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground">{r.scheduled_date}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title={`Dirty vehicle reports (${data.dirty_reports?.length ?? 0})`}>
        {!data.dirty_reports?.length ? <p className="text-sm text-muted-foreground">None.</p> : (
          <Card className="divide-y divide-border">
            {data.dirty_reports.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between p-3 text-sm">
                <div>
                  <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-destructive" />{r.reason}</p>
                  {r.notes && <p className="mt-0.5 text-xs text-muted-foreground">{r.notes}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{(r.services as any)?.partners?.full_name ?? "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground">{(r.services as any)?.scheduled_date}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title={`Parking issues (${data.parking_reports?.length ?? 0})`}>
        {!data.parking_reports?.length ? <p className="text-sm text-muted-foreground">None.</p> : (
          <Card className="divide-y divide-border">
            {data.parking_reports.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between p-3 text-sm">
                <div>
                  <p className="font-medium flex items-center gap-1.5"><ParkingCircle className="h-3.5 w-3.5 text-destructive" />{r.reason}</p>
                  {r.notes && <p className="mt-0.5 text-xs text-muted-foreground">{r.notes}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{(r.services as any)?.partners?.full_name ?? "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground">{(r.services as any)?.scheduled_date}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title={`Extension history (${data.extensions.length})`}>

        {data.extensions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extensions yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {data.extensions.map((e: any) => (
              <div key={e.id} className="flex items-start justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">{e.days > 0 ? `+${e.days}` : e.days} days · {e.previous_end} → {e.new_end}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.reason}</p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wider">{label}</span></div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
