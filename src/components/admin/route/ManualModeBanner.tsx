import { Button } from "@/components/ui/button";
import { Sparkles, Hand, RefreshCw } from "lucide-react";

type Props = {
  active: boolean;
  since?: string | null;
  onResumeAi: () => void;
  onOptimizeRemaining: () => void;
  onOptimizeAll: () => void;
  canEdit: boolean;
};

export function ManualModeBanner({ active, since, onResumeAi, onOptimizeRemaining, onOptimizeAll, canEdit }: Props) {
  if (!active) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Hand className="h-4 w-4" /> Manual Mode Enabled
        {since && (
          <span className="text-xs font-normal text-amber-700">
            since {new Date(since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — AI optimizer paused for this partner
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={onOptimizeRemaining} disabled={!canEdit}>
          <RefreshCw className="mr-1 h-4 w-4" /> Optimize remaining
        </Button>
        <Button size="sm" variant="outline" onClick={onOptimizeAll} disabled={!canEdit}>
          <Sparkles className="mr-1 h-4 w-4" /> Optimize entire route
        </Button>
        <Button size="sm" onClick={onResumeAi} disabled={!canEdit}>
          Resume AI
        </Button>
      </div>
    </div>
  );
}
