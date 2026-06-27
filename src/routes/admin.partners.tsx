import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listAdminPartners } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EditPartnerDialog } from "@/components/EditPartnerDialog";
import { Briefcase, Search, Route as RouteIcon } from "lucide-react";

export const Route = createFileRoute("/admin/partners")({
  component: PartnersPage,
});

function PartnersPage() {
  const fn = useServerFn(listAdminPartners);
  const { data } = useQuery({ queryKey: ["admin-partners"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((p: any) =>
      [p.full_name, p.phone, p.partner_code, p.id, p.home_area]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term))
    );
  }, [data, q]);

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Partners</h1>
      <p className="mt-1 text-sm text-muted-foreground">{filtered.length} of {data?.length ?? 0} partners</p>

      <div className="mt-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone, partner code or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card className="mt-4 overflow-hidden p-0">
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
                <th className="px-4 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild size="sm" variant="ghost" title="View assignment">
                        <Link to="/admin/partner-assignment/$id" params={{ id: p.id }}>
                          <Briefcase className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <EditPartnerDialog partner={p} />
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No partners match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
