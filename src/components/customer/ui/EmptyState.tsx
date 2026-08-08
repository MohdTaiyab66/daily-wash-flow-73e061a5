import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Surface } from "./kit";

/**
 * Shared customer-app empty state. Redesigned for MD3 premium look.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = "default",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  tone?: "default" | "primary";
}) {
  return (
    <div
      className={cn(
        "flex animate-in fade-in zoom-in-95 duration-500 flex-col items-center px-8 py-16 text-center",
        className,
      )}
    >
      <div className="relative mb-8">
        {/* Glow effect for primary tone */}
        {tone === "primary" && (
          <div className="absolute inset-0 -m-4 bg-primary/10 blur-2xl rounded-full" />
        )}
        <Surface 
          className={cn(
            "relative grid h-24 w-24 place-items-center rounded-[32px] border-none shadow-sm",
            tone === "primary" ? "bg-primary text-white" : "bg-white text-muted-foreground/40",
          )}
        >
          <Icon className="h-10 w-10" strokeWidth={1.5} />
        </Surface>
        
        {/* Decorative elements */}
        <div className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-primary/20 animate-pulse" />
        <div className="absolute -left-1 -bottom-1 h-3 w-3 rounded-full bg-primary/10" />
      </div>

      <h3 className="text-[20px] font-black tracking-tight text-[#1a1a1a]">{title}</h3>
      
      {description && (
        <p className="mt-2.5 max-w-[18rem] text-[14px] font-medium leading-relaxed text-muted-foreground/70">
          {description}
        </p>
      )}
      
      {action && <div className="mt-10 w-full max-w-[200px]">{action}</div>}
    </div>
  );
}
