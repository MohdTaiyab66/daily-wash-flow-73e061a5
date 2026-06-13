import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { extendCustomerSubscription } from "@/lib/admin.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";

const REASONS = [
  "Customer request",
  "Service missed",
  "Goodwill credit",
  "Payment delay",
  "Holiday / travel",
  "Other",
];

export function ExtendCustomerDialog({
  customerId,
  currentEnd,
  variant = "default",
}: {
  customerId: string;
  currentEnd: string | null;
  variant?: "default" | "outline";
}) {
  const qc = useQueryClient();
  const fn = useServerFn(extendCustomerSubscription);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [preset, setPreset] = useState(REASONS[0]);
  const [reasonText, setReasonText] = useState("");

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        customer_id: customerId,
        days,
        reason: preset === "Other" ? reasonText.trim() : `${preset}${reasonText ? ` — ${reasonText.trim()}` : ""}`,
      },
    }),
    onSuccess: () => {
      toast.success(`Extended by ${days} days`);
      qc.invalidateQueries();
      setOpen(false);
      setDays(7);
      setReasonText("");
      setPreset(REASONS[0]);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not extend"),
  });

  const reasonValid = preset !== "Other" || reasonText.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <CalendarPlus className="mr-2 h-4 w-4" />Extend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend subscription</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-xs text-muted-foreground">Current renewal: <b>{currentEnd ?? "—"}</b></div>
          <div>
            <Label className="text-xs">Days to add</Label>
            <Input type="number" value={days} onChange={(e) => setDays(parseInt(e.target.value || "0", 10))} min={-30} max={90} className="mt-1.5" />
            <p className="mt-1 text-[11px] text-muted-foreground">Use a negative number to reduce days.</p>
          </div>
          <div>
            <Label className="text-xs">Reason *</Label>
            <select className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <Textarea
              className="mt-2"
              placeholder={preset === "Other" ? "Describe the reason (required)" : "Additional notes (optional)"}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!reasonValid || days === 0 || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
