import { Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import { Surface, StatusChip } from "./kit";
import { cn } from "@/lib/utils";

interface UWPlanCardProps {
  status: 'active' | 'pending' | 'none';
  name: string;
  price?: number;
  daysLeft?: number;
  isExpiring?: boolean;
  onClick?: () => void;
  className?: string;
}

export function UWPlanCard({
  status,
  name,
  price,
  daysLeft,
  isExpiring,
  onClick,
  className
}: UWPlanCardProps) {
  if (status === 'none') return null;

  return (
    <Surface 
      onClick={onClick}
      className={cn(
        "relative overflow-hidden border-2 p-5",
        status === 'active' ? "border-success/20 bg-white" : "border-warning/30 bg-white",
        className
      )}
    >
      <div className={cn(
        "absolute -right-6 -top-6 h-24 w-24 rounded-full blur-3xl",
        status === 'active' ? "bg-success/10" : "bg-warning/10"
      )} />
      
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className={cn(
              "flex h-5 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
              status === 'active' ? "bg-success/10 text-success" : "bg-warning/10 text-warning-foreground"
            )}>
              <Sparkles className="h-2.5 w-2.5" />
              Daily Shine
            </span>
            <StatusChip 
              tone={status === 'active' ? "success" : "warning"} 
              className="h-5 px-2 text-[9px] font-black uppercase tracking-wider"
            >
              {status === 'active' ? "Active" : "Pending"}
            </StatusChip>
          </div>
          
          <h3 className="text-[17px] font-black tracking-tight text-foreground">
            {name}
          </h3>
          
          <div className="mt-1 flex items-center gap-2 text-[12px] font-bold text-muted-foreground/60">
            {price && <div className="flex flex-col"><div className="text-[7px] opacity-40 font-mono">B:2026-08-13-DIAG-A P:₹{price} C:UWPlanCard</div><span>₹{price.toLocaleString("en-IN")} / mo</span></div>}
            {price && daysLeft !== undefined && <span className="opacity-30">·</span>}
            {daysLeft !== undefined && (
              <span className={cn(isExpiring && "text-destructive font-black")}>
                {daysLeft} days left
              </span>
            )}
          </div>
        </div>
        
        <div className={cn(
          "grid h-10 w-10 place-items-center rounded-xl shadow-sm",
          status === 'active' ? "bg-success/10 text-success" : "bg-warning/10 text-warning-foreground"
        )}>
          {status === 'active' ? <CheckCircle2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-between border-t border-black/[0.03] pt-3">
        <span className="text-[12px] font-bold text-muted-foreground">
          {status === 'active' ? "Everything looks great" : "Action required"}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
      </div>
    </Surface>
  );
}
