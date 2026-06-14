import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminPartners } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditPartnerDialog } from "@/components/EditPartnerDialog";

export const Route = createFileRoute("/admin/partners")({
  component: PartnersPage,
});


function PartnersPage() {
  const fn = useServerFn(listAdminPartners);
  const { data } = useQuery({ queryKey: ["admin-partners"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Partners</h1>
      <p className="mt-1 text-sm text-muted-foreground">{data?.length ?? 0} partners onboarded</p>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Cars</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>

            </thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.full_name ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{p.partner_code}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">+91 {p.phone}</td>
                  <td className="px-4 py-3 capitalize"><Badge variant="outline">{p.status?.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${p.availability === "online" ? "text-[color:var(--success)]" : "text-muted-foreground"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.availability === "online" ? "bg-[color:var(--success)]" : "bg-muted-foreground"}`} />
                      {p.availability}
                    </span>
                  </td>
                  <td className="px-4 py-3">{p.cars_selected}</td>
                  <td className="px-4 py-3">{Number(p.rating).toFixed(2)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.joined_on}</td>
                  <td className="px-4 py-3"><EditPartnerDialog partner={p} /></td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No partners yet.</td></tr>
              )}

            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
