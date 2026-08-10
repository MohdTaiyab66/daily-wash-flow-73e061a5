import { Link, useLocation } from "@tanstack/react-router";
import { Home, Sparkles, Calendar, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = [
    { to: "/c/home", label: "HOME", icon: Home },
    { to: "/c/subscriptions", label: "MY PLAN", icon: Sparkles },
    { to: "/c/bookings", label: "BOOKINGS", icon: Calendar },
    { to: "/c/profile", label: "PROFILE", icon: User },
  ] as const;

  const isCheckout = pathname.startsWith("/c/service/") || pathname.startsWith("/c/vehicles/add") || pathname.includes("/vehicles/");
  
  return (
    <div className={cn(
      "min-h-screen bg-background pb-[calc(84px+env(safe-area-inset-bottom))]",
      isCheckout && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isCheckout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-md items-center justify-around px-3 py-2">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold transition-all",
                    active ? "text-[#2D2D2D]" : "text-[#9E9E9E]"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-[44px] w-[52px] place-items-center rounded-full transition-all duration-300",
                      active ? "bg-[#FF6B00] text-white" : "bg-transparent text-[#9E9E9E]"
                    )}
                  >
                    <Icon className="h-[20px] w-[20px]" strokeWidth={active ? 2.5 : 2} />
                  </span>
                  <span className={cn("tracking-[0.05em] uppercase text-[9px] font-[600]", active ? "opacity-100" : "opacity-80")}>
                    {n.label}
                  </span>

                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
