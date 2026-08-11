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
  
  // Refined height for premium feel: ~64px excluding safe area
  return (
    <div className={cn(
      "min-h-screen bg-background pb-[calc(64px+env(safe-area-inset-bottom))]",
      isCheckout && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isCheckout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.04)] bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-md items-center justify-around h-[64px] px-4">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-1 flex-col items-center justify-center transition-all group"
                >
                  <div
                    className={cn(
                      "grid h-[44px] w-[44px] place-items-center rounded-2xl transition-all duration-300",
                      active ? "bg-[#FF6B00] text-white shadow-[0_4px_12px_rgba(255,107,0,0.2)]" : "bg-transparent text-[#8A8A8A]"
                    )}
                  >
                    <Icon className="h-[20px] w-[20px]" strokeWidth={1.75} />
                  </div>
                  <span className={cn(
                    "mt-1 text-[13px] font-medium tracking-tight transition-colors",
                    active ? "text-[#1A1A1A]" : "text-[#8A8A8A]"
                  )}>
                    {n.label.charAt(0) + n.label.slice(1).toLowerCase()}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
  );
}
