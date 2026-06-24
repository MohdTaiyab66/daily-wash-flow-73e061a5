import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/funnel")({
  ssr: false,
  head: () => ({ meta: [{ title: "Booking funnel — Admin" }] }),
  component: AdminFunnel,
});

type Row = { event: string; created_at: string; session_id: string | null };

const STAGES: Array<{ key: string; label: string; help: string }> = [
  { key: "visit_splash", label: "Visitors", help: "Splash screen opened" },
  { key: "skip_login", label: "Guests (Skip Login)", help: "Tapped Skip Login" },
  { key: "vehicle_added_guest", label: "Guest vehicles", help: "Added a vehicle before login" },
  { key: "booking_started", label: "Bookings started", help: "Reached the checkout review" },
  { key: "otp_completed", label: "OTP completions", help: "Phone verified" },
  { key: "payment_completed", label: "Payments completed", help: "Booking paid" },
];

const RANGES = [
  { key: "1d", label: "24h", days: 1 },
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
] as const;

function AdminFunnel() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("7d");
  const days = RANGES.find((r) => r.key === range)!.days;
  const since = useMemo(() => new Date(Date.now() - days * 86400_000).toISOString(), [days]);

  const q = useQuery({
    queryKey: ["funnel-events", range],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("funnel_events")
        .select("event,created_at,session_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10_000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const counts = useMemo(() => {
    const out: Record<string, { total: number; sessions: number }> = {};
    const sessSets: Record<string, Set<string>> = {};
    for (const r of q.data ?? []) {
      out[r.event] = out[r.event] ?? { total: 0, sessions: 0 };
      out[r.event].total += 1;
      if (r.session_id) {
        sessSets[r.event] = sessSets[r.event] ?? new Set();
        sessSets[r.event].add(r.session_id);
      }
    }
    for (const k of Object.keys(out)) out[k].sessions = sessSets[k]?.size ?? 0;
    return out;
  }, [q.data]);

  const top = counts["visit_splash"]?.sessions ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <TrendingUp className="h-5 w-5 text-primary" /> Booking funnel
          </h1>
          <p className="text-sm text-muted-foreground">
            Visitors → Guests → Vehicles → Bookings → OTP → Payments
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                range === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-40 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Unique sessions</th>
                <th className="px-4 py-3 text-right">Events</th>
                <th className="px-4 py-3 text-right">Conv. vs visitors</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((s) => {
                const c = counts[s.key] ?? { total: 0, sessions: 0 };
                const pct = top > 0 ? Math.round((c.sessions / top) * 100) : 0;
                return (
                  <tr key={s.key} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.help}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{c.sessions}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.key === "visit_splash" ? "—" : `${pct}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Sessions are anonymous browser identifiers stored client-side. Funnel rows are write-only for
        anyone; only admins can read them.
      </p>
    </div>
  );
}
