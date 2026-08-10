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
  
  // Height target: ~72px excluding safe area
  return (
    <div className={cn(
      "min-h-screen bg-background pb-[calc(76px+env(safe-area-inset-bottom))]",
      isCheckout && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isCheckout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(80,50,30,0.08)] bg-[#F3E5D7] pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-md items-center justify-around h-[72px] px-2">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center transition-colors",
                    active ? "text-[#2D2D2D]" : "text-[#8A8783]"
                  )}
                >
                  <div
                    className={cn(
                      "grid h-[40px] w-[50px] place-items-center rounded-xl transition-all duration-200",
                      active ? "bg-[#FF6B00] text-white shadow-[0_4px_8px_rgba(255,107,0,0.15)]" : "bg-transparent text-[#8A8783]"
                    )}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
                  </div>
                  <span className={cn(
                    "mt-[5px] text-[12px] font-semibold tracking-wide uppercase",
                    active ? "text-[#2D2D2D]" : "text-[#8A8783]"
                  )}>
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
