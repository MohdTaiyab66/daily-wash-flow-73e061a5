import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, ArrowRight, Info } from "lucide-react";
import { useState } from "react";

export type Conflict = {
  level: "error" | "warning";
  service_id: string;
  name: string;
  message: string;
};

export type DiffEntry = {
  service_id: string;
  name: string;
  from: number | null;
  to: number;
  eta_at: string | null;
  eta_shift_min: number; // signed (positive = later)
};

export type PreviewSummary = {
  total: number;
  added: number;
  removed: number;
  moved: number;
  notified: number; // customers whose ETA shifts past threshold
  totalDistanceKm: number;
  totalDriveMin: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conflicts: Conflict[];
  diff: DiffEntry[];
  summary: PreviewSummary;
  saving: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function SavePreviewDialog({
  open, onOpenChange, conflicts, diff, summary, saving, onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const blocking = conflicts.some((c) => c.level === "error");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review route changes</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center md:grid-cols-6">
          <Stat label="Stops" value={summary.total} />
          <Stat label="Added" value={summary.added} />
          <Stat label="Removed" value={summary.removed} />
          <Stat label="Moved" value={summary.moved} />
          <Stat label="Distance" value={`${summary.totalDistanceKm.toFixed(1)} km`} />
          <Stat label="Notify" value={summary.notified} highlight={summary.notified > 0} />
        </div>

        {conflicts.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" /> {conflicts.length} issue(s) detected
            </p>
            <ul className="max-h-32 space-y-1 overflow-auto text-xs text-amber-900">
              {conflicts.map((c, i) => (
                <li key={`${c.service_id}-${i}`} className="flex gap-1.5">
                  <Badge variant="outline" className={c.level === "error" ? "border-red-400 text-red-700" : "border-amber-400 text-amber-800"}>
                    {c.level}
                  </Badge>
                  <span><b>{c.name}</b> — {c.message}</span>
                </li>
              ))}
            </ul>
            {blocking && (
              <p className="text-xs text-red-700">Resolve the errors above before saving.</p>
            )}
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Sequence changes</p>
          <div className="max-h-56 divide-y overflow-auto rounded-md border text-sm">
            {diff.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No sequence changes.</p>
            )}
            {diff.map((d) => (
              <div key={d.service_id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="w-32 truncate font-medium">{d.name}</span>
                <span className="font-mono text-muted-foreground">{d.from ?? "—"}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono">{d.to}</span>
                {d.eta_at && <span className="ml-auto text-muted-foreground">ETA {new Date(d.eta_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                {d.eta_shift_min !== 0 && (
                  <Badge variant="outline" className={Math.abs(d.eta_shift_min) >= 15 ? "border-amber-400 text-amber-800" : ""}>
                    {d.eta_shift_min > 0 ? `+${d.eta_shift_min}m` : `${d.eta_shift_min}m`}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3" /> Customers with ETA shifts ≥ 15 min will be notified automatically.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sp-reason" className="text-xs">Reason (optional, audit log)</Label>
          <Textarea id="sp-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. morning re-route after VIP added" />
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>Back</Button>
          <Button disabled={saving || blocking} onClick={() => onConfirm(reason)}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <p className="text-sm font-semibold leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
