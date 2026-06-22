import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, HelpCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/_authed/bookings")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Bookings — Urban Wash" }] }),
  component: BookingsPage,
});

type Tab = "upcoming" | "previous";
type Row = {
  id: string;
  scheduled_date: string;
  preferred_before_time: string | null;
  status: string;
  payment_status: string | null;
  total_amount: number;
  service_catalog: { name: string; slug: string } | null;
};

function BookingsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");

  const q = useQuery({
    queryKey: ["customer-bookings", tab],
    queryFn: async (): Promise<Row[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, preferred_before_time, status, payment_status, total_amount, service_catalog:service_id(name, slug)")
        .order("scheduled_date", { ascending: tab === "upcoming" })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      return tab === "upcoming"
        ? rows.filter((r) => r.scheduled_date >= today && !["completed", "cancelled"].includes(r.status))
        : rows.filter((r) => r.scheduled_date < today || ["completed", "cancelled"].includes(r.status));
    },
  });

  const items = q.data ?? [];

  return (
    <div className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Bookings</h1>
        <Button variant="outline" size="sm" className="rounded-full">
          <HelpCircle className="mr-1.5 h-4 w-4" /> Help
        </Button>
      </div>

      <div className="mt-5 rounded-full border border-border bg-card p-1 flex">
        {(["upcoming", "previous"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {q.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center pt-12">
            <div className="grid h-24 w-24 place-items-center rounded-2xl bg-accent">
              <CalendarDays className="h-12 w-12 text-accent-foreground" />
            </div>
            <p className="mt-5 text-sm text-muted-foreground">No bookings found</p>
            <Button asChild className="mt-6 rounded-full">
              <Link to="/c/home">Browse services</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{b.service_catalog?.name ?? "Service"}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {b.scheduled_date}{b.preferred_before_time ? ` · ${b.preferred_before_time}` : ""}
                  </div>
                  <div className="mt-1 text-xs font-medium">₹{b.total_amount}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium capitalize text-accent-foreground">
                    {b.status.replaceAll("_", " ")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
