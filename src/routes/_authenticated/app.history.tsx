import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { Calendar, Car, IndianRupee, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/history")({
  component: HistoryPage,
});

const RATE = 17;

function HistoryPage() {
  const [range, setRange] = useState<"today" | "week" | "month">("week");

  const { data: rows } = useQuery({
    queryKey: ["history", range],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const today = new Date();
      const start = new Date(today);
      if (range === "week") start.setDate(today.getDate() - 7);
      if (range === "month") start.setDate(today.getDate() - 30);
      const startStr = range === "today" ? today.toISOString().slice(0, 10) : start.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("services")
        .select("scheduled_date,status,rate_per_car,customers(area)")
        .eq("partner_id", u.user!.id)
        .eq("status", "completed")
        .gte("scheduled_date", startStr)
        .order("scheduled_date", { ascending: false });
      return data ?? [];
    },
  });

  const byDay = new Map<string, { cars: number; earnings: number; area: string }>();
  for (const r of rows ?? []) {
    const ex = byDay.get(r.scheduled_date) ?? { cars: 0, earnings: 0, area: (r.customers as any)?.area ?? "" };
    ex.cars += 1;
    ex.earnings += Number(r.rate_per_car || RATE);
    byDay.set(r.scheduled_date, ex);
  }
  const days = Array.from(byDay.entries());

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your completed services and daily earnings.</p>

      <Tabs value={range} onValueChange={(v) => setRange(v as any)} className="mt-5">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">7 days</TabsTrigger>
          <TabsTrigger value="month">30 days</TabsTrigger>
        </TabsList>
        <TabsContent value={range} className="mt-4 space-y-3">
          {days.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No activity in this range.</Card>
          )}
          {days.map(([date, agg]) => (
            <Card key={date} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Calendar className="h-4 w-4 text-primary" />
                    {new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{agg.area || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">₹{agg.earnings}</p>
                  <p className="text-[11px] text-muted-foreground"><Car className="mr-1 inline h-3 w-3" />{agg.cars} cars</p>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
