import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminDeleteCustomer, getCustomerProfile, adminSetCustomerPayment, adminSetVehicleDiscountApproval } from "@/lib/admin.functions";
import { getUserPaymentAttempts } from "@/lib/payment.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExtendCustomerDialog } from "@/components/ExtendCustomerDialog";
import { EditCustomerDialog } from "@/components/EditCustomerDialog";
import { MonthlyWashTracker } from "@/components/MonthlyWashTracker";
import { ArrowLeft, Car, Phone, MapPin, Calendar, Clock, User as UserIcon, AlertTriangle, ParkingCircle, XCircle, Trash2, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { VehicleImage } from "@/components/VehicleImage";




export const Route = createFileRoute("/admin/customers/$id")({
  component: CustomerProfilePage,
});

function CustomerProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getCustomerProfile);
  const deleteFn = useServerFn(adminDeleteCustomer);
  const { data, isLoading } = useQuery({
    queryKey: ["customer-profile", id],
    queryFn: () => fn({ data: { customer_id: id } }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: (data?.customer as any)?.id } }),
    onSuccess: () => { toast.success("Customer deleted"); qc.invalidateQueries({ queryKey: ["admin-customers"] }); navigate({ to: "/admin/customers" }); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });
  const setPayFn = useServerFn(adminSetCustomerPayment);
  const setDiscountApprovalFn = useServerFn(adminSetVehicleDiscountApproval);
  const setPayMut = useMutation({
    mutationFn: (status: "paid" | "pending") => setPayFn({ data: { id: (data?.customer as any)?.id, status } }),
    onSuccess: () => { toast.success("Payment status updated"); qc.invalidateQueries({ queryKey: ["customer-profile", id] }); qc.invalidateQueries({ queryKey: ["admin-revenue"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const setDiscountApprovalMut = useMutation({
    mutationFn: ({ vehicleId, approved }: { vehicleId: string; approved: boolean }) =>
      setDiscountApprovalFn({ data: { vehicle_id: vehicleId, approved } }),
    onSuccess: () => {
      toast.success("Vehicle discount approval updated");
      qc.invalidateQueries({ queryKey: ["customer-profile", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Not found.</div>;

  const c = data.customer as any;
  const primaryVehicle = data.vehicles?.[0] as any;
  const status = data.days_remaining == null ? "—" : data.days_remaining < 0 ? "Expired" : data.days_remaining <= 7 ? "Due soon" : "Active";
  const statusColor = status === "Expired" ? "destructive" : status === "Due soon" ? "secondary" : "default";
  const paid = c.payment_status === "paid";
  const totalAmount = (data.vehicles ?? []).reduce((s: number, v: any) => s + Number(v.package_amount || 0), 0);


  return (
    <div>
      <Link to="/admin/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{c.full_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />+91 {String(c.phone ?? "").replace(/^\+?91/, "")}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.area}</span>
            <Badge variant={statusColor as any}>{status}</Badge>
            <Badge variant={paid ? "default" : "destructive"}>{paid ? "Paid" : "Pending payment"}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={paid ? "outline" : "default"} size="sm" onClick={() => setPayMut.mutate(paid ? "pending" : "paid")} disabled={setPayMut.isPending}>
            <IndianRupee className="mr-1 h-3.5 w-3.5" />Mark as {paid ? "pending" : "paid"}
          </Button>
          <EditCustomerDialog customer={{ ...c, package_amount: primaryVehicle?.package_amount ?? "", front_image_path: primaryVehicle?.front_image_path ?? "" }} vehicles={data.vehicles ?? []} />
          <ExtendCustomerDialog customerId={c.id} currentEnd={data.renewal_date} />
          <Button variant="outline" size="sm" onClick={() => confirm("Delete this customer and pending services?") && deleteMut.mutate()} disabled={deleteMut.isPending}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
          </Button>
        </div>
      </div>

      <Card className="mt-4 flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subscription amount</p>
          <p className="mt-1 text-lg font-semibold">₹{totalAmount.toLocaleString("en-IN")}</p>
        </div>
        <Badge variant={paid ? "default" : "destructive"}>{paid ? `Paid${c.paid_at ? ` · ${new Date(c.paid_at).toLocaleDateString()}` : ""}` : "Pending payment"}</Badge>
      </Card>


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
              <VehicleImage path={v.front_image_path} signedUrl={v.signed_image_url} className="mb-3 h-32 w-full rounded-md" alt={`${v.make} ${v.model}`} />
              <div className="flex items-center gap-2 text-sm font-medium"><Car className="h-4 w-4" />{v.make} {v.model}</div>
              <p className="mt-1 text-xs text-muted-foreground">{v.registration_number}{v.color ? ` · ${v.color}` : ""}</p>
              <p className="mt-1 text-xs font-medium">Package: {v.package_amount ? `₹${v.package_amount}` : "—"}</p>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div>
                  <p className="text-xs font-medium">First-car discount exception</p>
                  <p className="text-[10px] text-muted-foreground">Only approve when admin wants this vehicle to receive coupon discounts.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={v.discount_approved ? "default" : "outline"}
                  disabled={setDiscountApprovalMut.isPending}
                  onClick={() => setDiscountApprovalMut.mutate({ vehicleId: v.id, approved: !v.discount_approved })}
                >
                  {v.discount_approved ? "Approved" : "Approve"}
                </Button>
              </div>
              {v.parking_notes && <p className="mt-2 text-xs text-muted-foreground">{v.parking_notes}</p>}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Today's route">
        {data.today_route ? (
          <Card className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Seq #{(data.today_route as any).manual_sequence_no ?? (data.today_route as any).sequence_no ?? "—"}</Badge>
              <Badge variant="outline">{(data.today_route as any).time_slot ?? "—"}</Badge>
              <Badge>{(data.today_route as any).status}</Badge>
              {(data.today_route as any).cluster_id && <Badge variant="secondary">Cluster {(data.today_route as any).cluster_id}</Badge>}
              {(data.today_route as any).locked_position && <Badge variant="secondary">Locked</Badge>}
              {(data.today_route as any).is_emergency && <Badge variant="destructive">Emergency</Badge>}
              {(data.today_route as any).eta_at && <span className="text-xs text-muted-foreground">ETA {new Date((data.today_route as any).eta_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
              {(data.today_route as any).partners && <span className="text-xs text-muted-foreground">· {(data.today_route as any).partners.full_name}</span>}
            </div>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No route assignment for today.</p>
        )}
      </Section>

      {data.marketplace && (
        <Section title="Marketplace status">
          <Card className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={(data.marketplace as any).status === "assigned" ? "default" : "secondary"}>{(data.marketplace as any).status}</Badge>
              <span className="text-xs text-muted-foreground">Radius {(data.marketplace as any).radius_km} km</span>
              {(data.marketplace as any).offer_expires_at && <span className="text-xs text-muted-foreground">Offer expires {new Date((data.marketplace as any).offer_expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
              <span className="ml-auto text-xs text-muted-foreground">Updated {new Date((data.marketplace as any).updated_at).toLocaleString()}</span>
            </div>
          </Card>
        </Section>
      )}

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

      <PaymentAttemptsSection phone={c.phone} />
    </div>
  );
}

function PaymentAttemptsSection({ phone }: { phone: string | null | undefined }) {
  const fn = useServerFn(getUserPaymentAttempts);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payment-attempts", phone],
    enabled: !!phone,
    queryFn: () => fn({ data: { phone: phone as string, limit: 20 } }),
  });
  const attempts = data?.attempts ?? [];
  const outcomeVariant = (o: string): "default" | "secondary" | "destructive" | "outline" => {
    if (o === "success") return "default";
    if (o === "failure" || o === "timeout") return "destructive";
    return "secondary";
  };
  return (
    <Section title={`Payment attempts (${attempts.length})`}>
      {!phone ? (
        <p className="text-sm text-muted-foreground">No phone on file — cannot look up attempts.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : attempts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payment attempts recorded.</p>
      ) : (
        <Card className="divide-y divide-border">
          {attempts.map((a: any) => (
            <div key={a.id} className="flex items-start justify-between gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={outcomeVariant(a.outcome)}>{a.outcome}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Attempt #{a.attempt_no} · {a.channel}
                  </span>
                  <Link
                    to="/admin/service/$id"
                    params={{ id: a.booking_id }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Booking {String(a.booking_id).slice(0, 8)}…
                  </Link>
                </div>
                {a.error_message ? (
                  <p className="mt-1 text-xs text-destructive/90 break-words">
                    {a.error_code ? `[${a.error_code}] ` : ""}{a.error_message}
                  </p>
                ) : null}
                {a.provider_payment_id ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Payment id: {a.provider_payment_id}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </Card>
      )}
    </Section>
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
