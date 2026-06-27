import { Button } from "@/components/ui/button";
import { Undo2, Redo2, Save, X, Eye } from "lucide-react";

type Props = {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onPreview?: () => void;
  saving?: boolean;
};

export function SaveBar({ dirty, canUndo, canRedo, onUndo, onRedo, onDiscard, onSave, onPreview, saving }: Props) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-3 mt-3 border-t bg-background/95 px-3 py-2 shadow-lg backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          <span className="text-sm font-medium">Unsaved changes — not yet sent to partner</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onUndo} disabled={!canUndo}>
            <Undo2 className="mr-1 h-4 w-4" /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={onRedo} disabled={!canRedo}>
            <Redo2 className="mr-1 h-4 w-4" /> Redo
          </Button>
          {onPreview && (
            <Button size="sm" variant="outline" onClick={onPreview}>
              <Eye className="mr-1 h-4 w-4" /> Preview
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onDiscard}>
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={!!saving}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save route"}
          </Button>
        </div>
      </div>
    </div>
  );
}
