import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/cars")({
  component: CarsPage,
});

function CarsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["available-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_available_customers");
      if (error) throw error;
      return data ?? [];
    },
  });

  const claim = useMutation({
    mutationFn: async (customer_id: string) => {
      const { data, error } = await supabase.rpc("claim_customer", { p_customer_id: customer_id, p_rate: 80 });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Car added to your route for 30 days");
      qc.invalidateQueries({ queryKey: ["available-customers"] });
      qc.invalidateQueries({ queryKey: ["today-services"] });
      qc.invalidateQueries({ queryKey: ["me-partner"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not claim car"),
  });

  return (
    <div className="mx-auto max-w-md px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Available cars</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pick customers near you. Each adds 30 days of daily services at ₹80/car.</p>

      <div className="mt-5 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        )}
        {data?.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">All nearby cars have been claimed. Great work!</Card>
        )}
        {data?.map((c: any) => (
          <Card key={c.customer_id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{c.full_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.make} {c.model} · {c.registration_number}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {c.area} · {c.pincode}</p>
              </div>
              <Badge variant="outline" className="shrink-0">₹80/day</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.address_line} · {c.parking_notes}</p>
            <Button
              size="sm"
              className="mt-3 w-full"
              onClick={() => claim.mutate(c.customer_id)}
              disabled={claim.isPending}
            >
              {claim.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add to my route
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
