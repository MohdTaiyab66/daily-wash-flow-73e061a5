import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { modifyAssignment } from "@/lib/assignment.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

export function ModifyAssignmentDialog({
  assignmentId, currentCars, canModify, modsUsed, modsMax, cooldownUntil,
}: {
  assignmentId: string;
  currentCars: number;
  canModify: boolean;
  modsUsed: number;
  modsMax: number;
  cooldownUntil: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState(0);
  const fn = useServerFn(modifyAssignment);
  const qc = useQueryClient();
  const mutate = useMutation({
    mutationFn: () => fn({ data: { assignment_id: assignmentId, delta } }),
    onSuccess: (r: any) => {
      toast.success(`Updated to ${r?.new_target} cars · ${r?.modifications_remaining} change(s) left`);
      qc.invalidateQueries();
      setOpen(false);
      setDelta(0);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not modify"),
  });

  const newTotal = currentCars + delta;
  const valid = delta !== 0 && newTotal >= 15 && newTotal <= 30;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full" disabled={!canModify}>
          <Settings2 className="mr-2 h-4 w-4" /> Modify assignment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modify cars</DialogTitle>
          <DialogDescription>
            {modsUsed}/{modsMax} modifications used · max 3 per assignment, one every 2 days.
            {!canModify && cooldownUntil && (
              <span className="mt-1 block text-destructive">
                Next change allowed after {new Date(cooldownUntil).toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="my-6 flex items-center justify-center gap-6">
          <Button size="icon" variant="outline" onClick={() => setDelta((d) => d - 1)} disabled={newTotal - 1 < 15}>
            <Minus className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-5xl font-semibold tabular-nums">{newTotal}</p>
            <p className="mt-1 text-xs text-muted-foreground">cars per day · {delta >= 0 ? "+" : ""}{delta}</p>
          </div>
          <Button size="icon" variant="outline" onClick={() => setDelta((d) => d + 1)} disabled={newTotal + 1 > 30}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {delta > 0
            ? `Adding ${delta} customer${delta > 1 ? "s" : ""} from the nearest pool.`
            : delta < 0
            ? `Releasing ${-delta} customer${-delta > 1 ? "s" : ""} back to the pool for other partners.`
            : "Adjust car count up or down."}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutate.mutate()} disabled={!valid || mutate.isPending}>
            {mutate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
