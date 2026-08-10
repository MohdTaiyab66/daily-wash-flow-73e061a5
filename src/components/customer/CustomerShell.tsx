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
      "min-h-screen bg-background pb-[calc(100px+env(safe-area-inset-bottom))]",
      isCheckout && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isCheckout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(100,60,30,0.10)] bg-[#F3E7DC] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(100,60,30,0.03)]">
          <div className="mx-auto flex max-w-md items-center justify-around px-3 py-2.5">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1.5 py-1 text-[9px] font-[700] transition-colors",
                    active ? "text-[#2D2D2D]" : "text-[#8B8986]"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-[42px] w-[50px] place-items-center rounded-[18px] transition-all duration-300",
                      active ? "bg-[#FF6B00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.2)]" : "bg-transparent text-[#8B8986]"
                    )}
                  >
                    <Icon className="h-[20px] w-[20px]" strokeWidth={active ? 2.5 : 2} />
                  </span>
                  <span className={cn("tracking-[0.06em] uppercase", active ? "text-[#2D2D2D]" : "text-[#8B8986]")}>
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
