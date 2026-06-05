import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Timer, IndianRupee, Car, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: active } = useQuery({
    queryKey: ["active-assignment"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("assignments")
        .select("*")
        .eq("scheduled_date", d)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
  });

  const { data: offers, isLoading } = useQuery({
    queryKey: ["assignment-offers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_assignment_offers");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !active,
  });

  const accept = useMutation({
    mutationFn: async (target: number) => {
      const { data, error } = await supabase.rpc("accept_assignment", { p_target_cars: target });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Assignment accepted · route optimised");
      qc.invalidateQueries({ queryKey: ["today-services"] });
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["active-assignment"] });
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not accept"),
  });

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Available assignments</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose your capacity for today. Routes are auto-optimised.</p>

      {active && (
        <Card className="mt-5 border-0 bg-foreground p-5 text-background">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-background/60">Active assignment</p>
              <p className="mt-1 text-xl font-semibold">{active.area} · {active.target_cars} cars</p>
              <p className="mt-0.5 text-xs text-background/60">
                ₹{active.estimated_earnings} · {active.estimated_hours}h · {active.estimated_distance_km} km
              </p>
            </div>
            <Badge className="border-0 bg-primary text-primary-foreground">Active</Badge>
          </div>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate({ to: "/app" })}>
            Go to route
          </Button>
        </Card>
      )}

      {!active && (
        <div className="mt-5 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {offers?.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No assignments available near you right now. Check back soon.
            </Card>
          )}
          {offers?.map((o: any) => (
            <Card key={o.target_cars} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-primary" /> {o.area}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{o.target_cars} cars</p>
                  <p className="text-xs text-muted-foreground">₹17 per car</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Daily earnings</p>
                  <p className="mt-1 text-2xl font-semibold text-primary">₹{Number(o.estimated_earnings)}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs">
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground"><Timer className="h-3 w-3" />Time</div>
                  <p className="mt-1 font-medium">{o.estimated_hours}h</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground"><Car className="h-3 w-3" />Distance</div>
                  <p className="mt-1 font-medium">{o.estimated_distance_km} km</p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground"><IndianRupee className="h-3 w-3" />Rate</div>
                  <p className="mt-1 font-medium">₹17</p>
                </div>
              </div>

              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={accept.isPending}
                onClick={() => accept.mutate(o.target_cars)}
              >
                {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Accept assignment
              </Button>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] text-muted-foreground">
        Search expands automatically — 1 km → 2 km → 3 km → 5 km — until your capacity is filled.
      </p>
    </div>
  );
}
