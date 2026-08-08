import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { requestCancellation } from "@/lib/subscription-cancel.functions";

export function CancelPlanDialog({
  open,
  onOpenChange,
  subscriptionId,
  renewalDate,
  planName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subscriptionId: string | null;
  renewalDate: string | Date | null;
  planName: string;
}) {
  const qc = useQueryClient();
  const cancel = useServerFn(requestCancellation);
  const [confirming, setConfirming] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      if (!subscriptionId) throw new Error("No subscription");
      return cancel({ data: { subscriptionId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-subscription"] });
      toast.success("Cancellation scheduled. Your plan stays active until the end of the cycle.");
      onOpenChange(false);
      setConfirming(false);
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Could not cancel. Please try again.");
      setConfirming(false);
    },
  });

  const endsOn = renewalDate ? new Date(renewalDate).toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "the end of your cycle";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mut.isPending) { onOpenChange(v); if (!v) setConfirming(false); } }}>
      <DialogContent className="max-w-sm rounded-[32px] border-none shadow-2xl p-8">
        <DialogHeader>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[20px] bg-destructive/5 text-destructive">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <DialogTitle className="text-center text-xl font-black tracking-tight">Cancel {planName}?</DialogTitle>
          <DialogDescription className="text-center text-[14px] font-medium leading-relaxed text-muted-foreground/70 mt-2">
            Your plan will end on <span className="font-black text-[#1a1a1a]">{endsOn}</span>.
            The current month remains active — you keep all included washes until then.
            No more renewals after that.
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <DialogFooter className="mt-6 flex flex-col gap-3 sm:flex-col">
            <Button variant="destructive" onClick={() => setConfirming(true)} className="h-14 w-full rounded-2xl font-black shadow-lg shadow-destructive/10 transition-transform active:scale-95">Continue to cancel</Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-14 w-full rounded-2xl font-bold text-muted-foreground/60 transition-transform active:scale-95">Keep my plan</Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="mt-6 flex flex-col gap-3 sm:flex-col">
            <Button variant="destructive" onClick={() => mut.mutate()} className="h-14 w-full rounded-2xl font-black shadow-lg shadow-destructive/20 transition-transform active:scale-95" disabled={mut.isPending}>
              {mut.isPending ? <><Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> Cancelling…</> : "Confirm cancel"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} className="h-14 w-full rounded-2xl font-bold text-muted-foreground/60 transition-transform active:scale-95" disabled={mut.isPending}>
              Never mind
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
