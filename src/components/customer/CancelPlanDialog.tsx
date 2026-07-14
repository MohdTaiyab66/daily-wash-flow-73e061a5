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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Cancel {planName}?</DialogTitle>
          <DialogDescription className="text-center text-sm">
            Your plan will end on <span className="font-semibold text-foreground">{endsOn}</span>.
            The current month remains active — you keep all included washes until then.
            No more renewals after that.
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-col-reverse">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">Keep my plan</Button>
            <Button variant="destructive" onClick={() => setConfirming(true)} className="w-full">Continue to cancel</Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-col-reverse">
            <Button variant="outline" onClick={() => setConfirming(false)} className="w-full" disabled={mut.isPending}>
              Never mind
            </Button>
            <Button variant="destructive" onClick={() => mut.mutate()} className="w-full" disabled={mut.isPending}>
              {mut.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Cancelling…</> : "Confirm cancel"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
