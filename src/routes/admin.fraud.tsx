import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFraudFlags, clearFraudFlag } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/fraud")({
  component: FraudPage,
});

function FraudPage() {
  const fn = useServerFn(listFraudFlags);
  const clear = useServerFn(clearFraudFlag);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-fraud"], queryFn: () => fn() });
  const mutate = useMutation({
    mutationFn: (service_id: string) => clear({ data: { service_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-fraud"] }); toast.success("Flag cleared"); },
  });

  return (
    <div>
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <ShieldAlert className="h-7 w-7 text-destructive" /> Fraud Review
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Services whose photo GPS was outside the configured radius of the customer location, or missing GPS entirely.
      </p>

      <div className="mt-6 grid gap-3">
        {(data ?? []).map((s: any) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{s.customers?.full_name}</p>
                <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                  <MapPin className="mr-1 h-3 w-3" />{s.gps_flag?.replace("_", " ")} · {s.gps_distance_m ?? "?"}m
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.customers?.area} · Partner: {s.partners?.full_name} ({s.partners?.partner_code}) · {s.scheduled_date}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/service/$id" params={{ id: s.id }}>View</Link>
              </Button>
              <Button size="sm" onClick={() => mutate.mutate(s.id)} disabled={mutate.isPending}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />Clear flag
              </Button>
            </div>
          </Card>
        ))}
        {(data ?? []).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No flagged services 🎉</Card>
        )}
      </div>
    </div>
  );
}
