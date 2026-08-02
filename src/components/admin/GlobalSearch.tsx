import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { listAdminCustomers, listAdminPartners, listAdminServices } from "@/lib/admin.functions";
import { Search } from "lucide-react";

/**
 * One search for everything: customers, partners, vehicles / registrations,
 * phone numbers, bookings and subscriptions.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const customersFn = useServerFn(listAdminCustomers);
  const partnersFn = useServerFn(listAdminPartners);
  const servicesFn = useServerFn(listAdminServices);

  const { data: customers } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => customersFn(),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: partners } = useQuery({
    queryKey: ["admin-partners"],
    queryFn: () => partnersFn(),
    enabled: open,
    staleTime: 60_000,
  });
  const trimmed = term.trim();
  const { data: services } = useQuery({
    queryKey: ["global-search-services", trimmed],
    queryFn: () => servicesFn({ data: { q: trimmed } }),
    enabled: open && trimmed.length >= 2,
    staleTime: 30_000,
  });

  const lower = trimmed.toLowerCase();

  const customerHits = useMemo(() => {
    if (!lower) return [];
    return (customers ?? [])
      .filter((c: any) =>
        [c.full_name, c.phone, c.area, c.subscription_plan, ...(c.vehicles ?? []).map((v: any) => v.registration_number)]
          .filter(Boolean)
          .some((v: any) => String(v).toLowerCase().includes(lower)),
      )
      .slice(0, 6);
  }, [customers, lower]);

  const partnerHits = useMemo(() => {
    if (!lower) return [];
    return (partners ?? [])
      .filter((p: any) =>
        [p.full_name, p.phone, p.partner_code, p.home_area]
          .filter(Boolean)
          .some((v: any) => String(v).toLowerCase().includes(lower)),
      )
      .slice(0, 6);
  }, [partners, lower]);

  const go = (fn: () => void) => {
    setOpen(false);
    setTerm("");
    fn();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-border bg-muted/40 px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search customers, partners, vehicles, bookings…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium md:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder="Name, phone, registration, partner code, booking…"
        />
        <CommandList>
          <CommandEmpty>{trimmed ? "No matches found." : "Start typing to search."}</CommandEmpty>

          {customerHits.length > 0 && (
            <CommandGroup heading="Customers">
              {customerHits.map((c: any) => (
                <CommandItem
                  key={c.id}
                  value={`cust-${c.id}-${c.full_name}`}
                  onSelect={() => go(() => navigate({ to: "/admin/customers/$id", params: { id: c.id } }))}
                >
                  <span className="font-medium">{c.full_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.area} · +91 {String(c.phone ?? "").replace(/^\+?91/, "")}
                    {c.vehicles?.[0]?.registration_number ? ` · ${c.vehicles[0].registration_number}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {partnerHits.length > 0 && (
            <CommandGroup heading="Partners">
              {partnerHits.map((p: any) => (
                <CommandItem
                  key={p.id}
                  value={`part-${p.id}-${p.full_name}`}
                  onSelect={() => go(() => navigate({ to: "/admin/partner-assignment/$id", params: { id: p.id } }))}
                >
                  <span className="font-medium">{p.full_name ?? "Partner"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {p.partner_code} · +91 {p.phone}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(services ?? []).length > 0 && (
            <CommandGroup heading="Bookings & services">
              {(services ?? []).slice(0, 8).map((s: any) => (
                <CommandItem
                  key={s.id}
                  value={`svc-${s.id}`}
                  onSelect={() => go(() => navigate({ to: "/admin/service/$id", params: { id: s.id } }))}
                >
                  <span className="font-medium">{s.customers?.full_name ?? "Service"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.scheduled_date} · {String(s.status ?? "").replace("_", " ")}
                    {s.vehicles?.registration_number ? ` · ${s.vehicles.registration_number}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
