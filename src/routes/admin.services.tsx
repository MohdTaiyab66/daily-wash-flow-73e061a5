import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminServices } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/services")({
  component: ServicesPage,
});

function ServicesPage() {
  const fn = useServerFn(listAdminServices);
  const { data } = useQuery({ queryKey: ["admin-services"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Services</h1>
      <p className="mt-1 text-sm text-muted-foreground">Upcoming & scheduled services</p>

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
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3 whitespace-nowrap">{s.scheduled_date}</td>
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
