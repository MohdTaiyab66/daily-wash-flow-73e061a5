import { z } from "zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminServices } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type Filter = "today" | "all" | "running" | "pending" | "scheduled" | "completed" | "cancelled" | "missed";

const FILTERS: Array<{ id: Filter; label: string; statuses?: string[] }> = [
  { id: "today", label: "Today's" },
  { id: "running", label: "Running", statuses: ["in_progress", "started", "on_the_way"] },
  { id: "pending", label: "Pending", statuses: ["scheduled", "pending", "assigned"] },
  { id: "scheduled", label: "Scheduled", statuses: ["scheduled", "assigned"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { id: "missed", label: "Missed", statuses: ["missed", "delayed"] },
  { id: "all", label: "All" },
];

export const Route = createFileRoute("/admin/services")({
  validateSearch: z.object({ f: z.string().optional().catch(undefined) }).transform((v) => ({ f: v.f as Filter | undefined })),
  component: BookingsPage,
});

const TONE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground",
  missed: "bg-destructive/10 text-destructive",
  in_progress: "bg-primary/12 text-primary",
};

function BookingsPage() {
  const { f } = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter: Filter = f ?? "today";
  const [q, setQ] = useState("");
  const fn = useServerFn(listAdminServices);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-services", q],
    queryFn: () => fn({ data: { q } }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === "all") return all;
    if (filter === "today") return all.filter((s: any) => s.scheduled_date === today);
    const statuses = FILTERS.find((x) => x.id === filter)?.statuses ?? [];
    return all.filter((s: any) => statuses.includes(String(s.status ?? "")));
  }, [data, filter, today]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Search by customer, partner, vehicle, booking ID or phone.
      </p>

      <div className="mt-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bookings…" className="rounded-full pl-9" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate({ search: { f: tab.id } })}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === tab.id
                ? "border-primary bg-primary/12 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="mt-5 overflow-hidden rounded-2xl p-0 shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-3" colSpan={7}><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))}
              {!isLoading && rows.map((s: any) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link to="/admin/service/$id" params={{ id: s.id }} className="text-primary underline-offset-2 hover:underline">
                      {s.scheduled_date}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.time_slot}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.customers?.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.customers?.area}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.vehicles?.registration_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.partners ? s.partners.full_name : <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${TONE[s.status] ?? "bg-amber-500/10 text-amber-600"}`}>
                      {String(s.status ?? "").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">₹{s.rate_per_car}</td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No bookings match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
