import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, MapPin } from "lucide-react";

export const Route = createFileRoute("/admin/expansion-requests")({
  ssr: false,
  head: () => ({ meta: [{ title: "Expansion Requests — Admin" }] }),
  component: ExpansionRequestsAdmin,
});

type Row = {
  id: string; customer_id: string | null; phone: string | null;
  area_name: string | null; pincode: string | null; lat: number | null; lng: number | null;
  interested_service: string | null; status: string; created_at: string;
};

function ExpansionRequestsAdmin() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-expansion-requests"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("expansion_requests").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin-expansion-requests-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "expansion_requests" },
        () => qc.invalidateQueries({ queryKey: ["admin-expansion-requests"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Group by area
  const byArea = rows.reduce<Record<string, Row[]>>((acc, r) => {
    const k = r.area_name || r.pincode || "Unknown";
    (acc[k] = acc[k] || []).push(r);
    return acc;
  }, {});

  const exportCsv = () => {
    const header = ["created_at", "area_name", "pincode", "phone", "interested_service", "lat", "lng", "status"];
    const lines = [header.join(",")].concat(rows.map((r) => header.map((h) => JSON.stringify((r as any)[h] ?? "")).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "expansion-requests.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expansion Requests</h1>
          <p className="text-sm text-muted-foreground">Customer demand from unsupported areas. Updates in real time.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No expansion requests yet.</Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(byArea).sort((a, b) => b[1].length - a[1].length).map(([area, list]) => {
            const dailyShine = list.filter((r) => r.interested_service === "daily_shine").length;
            const premium = list.filter((r) => r.interested_service === "premium").length;
            return (
              <Card key={area} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{area}</h3>
                    <Badge variant="secondary">{list.length} requests</Badge>
                    {dailyShine > 0 && <Badge>Daily Shine ×{dailyShine}</Badge>}
                    {premium > 0 && <Badge variant="outline">Premium ×{premium}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">Latest: {new Date(list[0].created_at).toLocaleString()}</span>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  {list.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center justify-between border-t pt-1">
                      <span>{r.phone || "—"} · {r.interested_service || "general"} · {r.pincode || ""}</span>
                      <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {list.length > 5 && <div className="text-muted-foreground">+{list.length - 5} more…</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
