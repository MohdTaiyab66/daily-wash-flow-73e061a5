import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Urban Wash customer design kit.
 *
 * Purely presentational primitives shared by every customer screen so
 * spacing, radius, typography and status colour stay consistent.
 * Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 (Tailwind 1/2/3/4/5/6/8).
 */

/* ---------------------------------- text --------------------------------- */

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("text-[26px] font-black leading-tight tracking-tight text-[#1a1a1a]", className)}>{children}</h1>;
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("text-[16px] font-black tracking-tight text-[#1a1a1a]", className)}>{children}</h2>;
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[13px] leading-relaxed text-muted-foreground", className)}>{children}</p>;
}

/** Section wrapper: title row + optional trailing action, consistent rhythm. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-8", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {typeof title === "string" ? <SectionTitle>{title}</SectionTitle> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------------------------- cards -------------------------------- */

/** Flat surface. Borders are subtle; shadows only when `raised`. */
export function Surface({
  children,
  className,
  raised,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className={cn(
        "rounded-[22px] border border-border/70 bg-card p-4 transition-all",
        raised && "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-16px_rgba(0,0,0,0.18)]",
        onClick && "uw-pressable active:scale-[0.98]",
        className,
      )}
    >
      {children}
    </Component>
  );
}


/** Grouped list container — rows are divided, not individually carded. */
export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/50 overflow-hidden rounded-2xl border border-border bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}

type RowProps = {
  icon?: LucideIcon;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  to?: string;
  params?: Record<string, string>;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

/** Compact list row — the workhorse for services, settings and history. */
export function ListRow({
  icon: Icon,
  leading,
  title,
  subtitle,
  trailing,
  chevron = true,
  to,
  params,
  onClick,
  disabled,
  className,
}: RowProps) {
  const inner = (
    <>
      {leading ??
        (Icon ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
            <Icon className="h-4 w-4" />
          </span>
        ) : null)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {trailing}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />}
    </>
  );

  const cls = cn(
    "uw-pressable flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all active:bg-accent/40 active:scale-[0.98]",
    disabled ? "pointer-events-none opacity-50" : "",
    className,
  );

  if (to && !disabled) {
    return (
      <Link to={to as any} params={params as any} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/* --------------------------------- status -------------------------------- */

export type Tone = "success" | "warning" | "danger" | "neutral" | "brand" | "info";

const TONE: Record<Tone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/20 text-warning-foreground",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-primary/12 text-primary",
  info: "bg-blue-100 text-blue-700",
};

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps backend status strings to a human label + tone. Presentation only. */
export function statusTone(status: string | null | undefined): { label: string; tone: Tone } {
  const s = (status ?? "").toLowerCase();
  if (["completed", "active", "paid", "success", "succeeded"].includes(s))
    return { label: s === "paid" || s === "success" || s === "succeeded" ? "Paid" : s === "active" ? "Active" : "Completed", tone: "success" };
  if (["cancelled", "canceled", "failed", "rejected"].includes(s))
    return { label: s === "failed" ? "Failed" : "Cancelled", tone: "danger" };
  if (["skipped", "expired", "unavailable", "paused"].includes(s))
    return { label: s.charAt(0).toUpperCase() + s.slice(1), tone: "neutral" };
  if (!s) return { label: "—", tone: "neutral" };
  return { label: s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()), tone: "warning" };
}

/* --------------------------------- meters -------------------------------- */

/** Slim usage meter used for plan balances. */
export function Meter({
  value,
  max,
  tone = "brand",
  className,
}: {
  value: number;
  max: number;
  tone?: "brand" | "success";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-black/[0.03]", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tone === "success" ? "bg-success" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
