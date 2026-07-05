import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/payment-modes")({
  head: () => ({ meta: [{ title: "Payment Modes · Admin" }] }),
  component: PaymentModesPage,
});

type Row = {
  id: string;
  name: string;
  subtitle?: string | null;
  payment_mode: "pre" | "post";
};

function PaymentModesPage() {
  const qc = useQueryClient();

  const servicesQ = useQuery({
    queryKey: ["admin-payment-modes-services"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("service_catalog")
        .select("id,name,slug,service_type,payment_mode,active")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        subtitle: `${r.slug} · ${r.service_type}${r.active ? "" : " · inactive"}`,
        payment_mode: (r.payment_mode ?? "pre") as "pre" | "post",
      }));
    },
  });

  const addonsQ = useQuery({
    queryKey: ["admin-payment-modes-addons"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("service_addons")
        .select("id,name,payment_mode,active")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        subtitle: r.active ? null : "inactive",
        payment_mode: (r.payment_mode ?? "pre") as "pre" | "post",
      }));
    },
  });

  const setMode = useMutation({
    mutationFn: async (v: { table: "service_catalog" | "service_addons"; id: string; mode: "pre" | "post" }) => {
      const { error } = await (supabase as any)
        .from(v.table)
        .update({ payment_mode: v.mode })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      toast.success(`Set to ${v.mode === "pre" ? "Pre-Payment" : "Post-Payment"}`);
      qc.invalidateQueries({ queryKey: ["admin-payment-modes-services"] });
      qc.invalidateQueries({ queryKey: ["admin-payment-modes-addons"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });

  const renderTable = (title: string, rows: Row[] | undefined, table: "service_catalog" | "service_addons") => (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <div className="divide-y divide-border">
        {(!rows || rows.length === 0) && (
          <p className="p-4 text-sm text-muted-foreground">Nothing to show.</p>
        )}
        {(rows ?? []).map((r) => {
          const isPre = r.payment_mode === "pre";
          return (
            <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.name}</p>
                {r.subtitle && <p className="text-[11px] text-muted-foreground">{r.subtitle}</p>}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isPre ? "default" : "outline"} className="capitalize">
                  {isPre ? "Pre-Payment" : "Post-Payment"}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Pre</span>
                  <Switch
                    checked={!isPre}
                    onCheckedChange={(checked) =>
                      setMode.mutate({ table, id: r.id, mode: checked ? "post" : "pre" })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground">Post</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Payment Modes
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every service and add-on is <b>Pre-Payment</b> by default — the customer pays online
          before we start work. Flip the switch to <b>Post-Payment</b> for any service or add-on
          you want to collect after the service is completed (e.g. Daily Shine, premium services).
          If the selected service or any selected add-on is Pre-Payment, checkout requires online
          payment; otherwise the booking is confirmed without asking for payment.
        </p>
      </div>

      {renderTable("Services (Daily Shine, One-Time, Deep Clean, Interior, Premium…)", servicesQ.data, "service_catalog")}
      {renderTable("Add-ons", addonsQ.data, "service_addons")}
    </div>
  );
}
