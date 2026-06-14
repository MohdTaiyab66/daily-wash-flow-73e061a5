import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { markMonthlyWash, listAdminPartnersBrief } from "@/lib/admin.functions";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function MonthlyWashTracker({ customer }: { customer: any }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <WashCard
        title="Interior wash"
        doneDate={customer.interior_wash_done_date}
        kind="interior"
        customerId={customer.id}
        partnerId={customer.interior_wash_partner_id}
      />
      <WashCard
        title="Exterior wash"
        doneDate={customer.exterior_wash_done_date}
        kind="exterior"
        customerId={customer.id}
        partnerId={customer.exterior_wash_partner_id}
      />
    </div>
  );
}

function WashCard({ title, doneDate, kind, customerId, partnerId }: {
  title: string; doneDate: string | null; kind: "interior" | "exterior"; customerId: string; partnerId: string | null;
}) {
  const monthStart = new Date(); monthStart.setDate(1);
  const done = doneDate && new Date(doneDate) >= monthStart;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partner, setPartner] = useState(partnerId ?? "");
  const partnersFn = useServerFn(listAdminPartnersBrief);
  const { data: partners } = useQuery({ queryKey: ["admin-partners-brief"], queryFn: () => partnersFn(), enabled: open });
  const mark = useServerFn(markMonthlyWash);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => mark({ data: { customer_id: customerId, kind, done_date: date, partner_id: partner } }),
    onSuccess: () => { toast.success(`${title} marked done`); qc.invalidateQueries(); setOpen(false); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="font-medium">{title}</p></div>
        <Badge variant={done ? "default" : "secondary"}>{done ? "Completed" : "Pending"}</Badge>
      </div>
      {doneDate && <p className="mt-2 text-xs text-muted-foreground">Last done: {doneDate}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="mt-3 w-full"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{done ? "Update" : "Mark complete"}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {title.toLowerCase()} done</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Partner</Label>
              <Select value={partner} onValueChange={setPartner}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  {(partners ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name} · {p.partner_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!partner || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
