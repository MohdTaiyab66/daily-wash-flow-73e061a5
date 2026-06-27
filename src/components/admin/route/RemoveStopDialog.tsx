import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";

export type RemoveMode = "today_only" | "cancel" | "transfer";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customerName: string;
  hasOtherPartners: boolean;
  onConfirm: (mode: RemoveMode, reason: string) => Promise<void> | void;
};

export function RemoveStopDialog({ open, onOpenChange, customerName, hasOtherPartners, onConfirm }: Props) {
  const [mode, setMode] = useState<RemoveMode>("today_only");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try { await onConfirm(mode, reason); onOpenChange(false); setReason(""); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {customerName} from route</DialogTitle>
          <DialogDescription>Choose what should happen to this stop.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as RemoveMode)} className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-accent/50">
            <RadioGroupItem value="today_only" className="mt-0.5" />
            <div>
              <p className="font-medium">Remove today only</p>
              <p className="text-xs text-muted-foreground">Unassign from this partner today. Service stays scheduled — can be reassigned later.</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 rounded-md border p-3 text-sm ${hasOtherPartners ? "cursor-pointer hover:bg-accent/50" : "cursor-not-allowed opacity-50"}`}>
            <RadioGroupItem value="transfer" className="mt-0.5" disabled={!hasOtherPartners} />
            <div>
              <p className="font-medium">Transfer to another partner</p>
              <p className="text-xs text-muted-foreground">
                {hasOtherPartners ? "Pick the receiving partner after confirming." : "No other partners have routes today."}
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-accent/50">
            <RadioGroupItem value="cancel" className="mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Cancel service</p>
              <p className="text-xs text-muted-foreground">Mark the service as cancelled. Customer will be notified.</p>
            </div>
          </label>
        </RadioGroup>
        <div className="space-y-1">
          <Label htmlFor="rs-reason" className="text-xs">Reason (audit log)</Label>
          <Textarea id="rs-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. customer requested skip" />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={busy} variant={mode === "cancel" ? "destructive" : "default"}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {mode === "today_only" ? "Remove today" : mode === "transfer" ? "Continue to transfer" : "Cancel service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
