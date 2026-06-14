import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminServices } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/admin/services")({
  component: ServicesPage,
});

function ServicesPage() {
  const [q, setQ] = useState("");
  const fn = useServerFn(listAdminServices);
  const { data } = useQuery({ queryKey: ["admin-services", q], queryFn: () => fn({ data: { q } }) });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Services</h1>
      <p className="mt-1 text-sm text-muted-foreground">Search by customer, phone, vehicle plate, or partner.</p>
      <div className="mt-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
      </div>


      <Card className="mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((s: any) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to="/admin/service/$id" params={{ id: s.id }} className="text-primary underline-offset-2 hover:underline">{s.scheduled_date}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.time_slot}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.customers?.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.customers?.area}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.partners ? (
                      <>
                        <p>{s.partners.full_name}</p>
                        <p className="text-[11px] text-muted-foreground">{s.partners.partner_code}</p>
                      </>
                    ) : <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{s.status?.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-3">₹{s.rate_per_car}</td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No services scheduled.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
