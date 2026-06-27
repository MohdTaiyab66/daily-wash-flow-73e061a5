import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type PositionChoice =
  | { kind: "beginning" }
  | { kind: "end" }
  | { kind: "above"; ref: string }
  | { kind: "below"; ref: string }
  | { kind: "specific"; index: number };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  refRow?: { id: string; name: string } | null;
  onPick: (p: PositionChoice) => void;
};

export function PositionPickerDialog({ open, onOpenChange, total, refRow, onPick }: Props) {
  const [mode, setMode] = useState<"beginning" | "end" | "above" | "below" | "specific">(
    refRow ? "below" : "end",
  );
  const [pos, setPos] = useState(Math.max(1, total));

  function confirm() {
    if (mode === "beginning") onPick({ kind: "beginning" });
    else if (mode === "end") onPick({ kind: "end" });
    else if (mode === "above" && refRow) onPick({ kind: "above", ref: refRow.id });
    else if (mode === "below" && refRow) onPick({ kind: "below", ref: refRow.id });
    else onPick({ kind: "specific", index: Math.max(1, Math.min(total + 1, pos)) - 1 });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Insert at position</DialogTitle>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2"><RadioGroupItem value="beginning" /> Beginning of route</label>
          <label className="flex items-center gap-2"><RadioGroupItem value="end" /> End of route</label>
          {refRow && (
            <>
              <label className="flex items-center gap-2"><RadioGroupItem value="above" /> Above {refRow.name}</label>
              <label className="flex items-center gap-2"><RadioGroupItem value="below" /> Below {refRow.name}</label>
            </>
          )}
          <label className="flex items-center gap-2">
            <RadioGroupItem value="specific" />
            Specific position #
            <Input
              type="number" min={1} max={total + 1} value={pos}
              onChange={(e) => setPos(Number(e.target.value) || 1)}
              onFocus={() => setMode("specific")}
              className="ml-1 h-8 w-20"
            />
            <span className="text-xs text-muted-foreground">of {total + 1}</span>
          </label>
        </RadioGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm}>Insert here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
