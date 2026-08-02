import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listAdminPartners, listAdminServices } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditPartnerDialog } from "@/components/EditPartnerDialog";
import { Briefcase, MoreHorizontal, Route as RouteIcon, Search, Star } from "lucide-react";

export const Route = createFileRoute("/admin/partners")({
  component: PartnersPage,
});

function PartnersPage() {
  const fn = useServerFn(listAdminPartners);
  const servicesFn = useServerFn(listAdminServices);
  const { data, isLoading } = useQuery({ queryKey: ["admin-partners"], queryFn: () => fn() });
  const { data: services } = useQuery({ queryKey: ["admin-services", ""], queryFn: () => servicesFn({ data: { q: "" } }) });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const jobsByPartner = useMemo(() => {
    const map: Record<string, number> = {};
    (services ?? [])
      .filter((s: any) => s.scheduled_date === today)
      .forEach((s: any) => {
        const code = s.partners?.partner_code;
        if (code) map[code] = (map[code] ?? 0) + 1;
      });
    return map;
  }, [services, today]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((p: any) =>
      [p.full_name, p.phone, p.partner_code, p.home_area]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term)),
    );
  }, [data, q]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Partners</h1>
      <p className="mt-1 text-sm text-muted-foreground">{filtered.length} of {data?.length ?? 0} partners</p>

      <div className="relative mt-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Search by name, phone, partner code or area…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card className="mt-5 overflow-hidden rounded-2xl p-0 shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Today's jobs</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-3" colSpan={9}><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))}
              {filtered.map((p: any) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {String(p.full_name ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.full_name ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{p.partner_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">+91 {p.phone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.home_area ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{jobsByPartner[p.partner_code] ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium capitalize text-muted-foreground">
                      {String(p.status ?? "").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${p.availability === "online" ? "text-emerald-600" : "text-muted-foreground"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.availability === "online" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                      {p.availability}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current text-amber-500" />
                      {Number(p.rating).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.joined_on}</td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Actions" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/admin/partner-assignment/$id" params={{ id: p.id }}>
                            <Briefcase className="mr-2 h-4 w-4" /> View assignment
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/route-manager" search={{ partner: p.id }}>
                            <RouteIcon className="mr-2 h-4 w-4" /> Today's route
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTimeout(() => setEditing(p), 0)}>
                          Edit partner
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">No partners match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <EditPartnerDialog
          key={editing.id}
          partner={editing}
          open
          onOpenChange={(v: boolean) => { if (!v) setEditing(null); }}
        />
      )}
    </div>
  );
}
