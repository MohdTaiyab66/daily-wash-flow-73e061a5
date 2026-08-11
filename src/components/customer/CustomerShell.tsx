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
  
  // Premium spacious height: ~90-100px excluding safe area
  return (
    <div className={cn(
      "min-h-screen bg-background pb-[calc(100px+env(safe-area-inset-bottom))]",
      isCheckout && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isCheckout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.05)] bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-md items-center justify-between h-[90px] px-6">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
              const label = n.label === "HOME" ? "Home" : n.label.charAt(0) + n.label.slice(1).toLowerCase();
              
              if (active) {
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    aria-current="page"
                    className="flex items-center justify-center h-[58px] min-w-[135px] px-5 rounded-[28px] bg-[#FFF1E8] transition-all duration-300 group shrink-0"
                  >
                    <Icon className="h-[26px] w-[26px] text-[#FF6B00] mr-2" strokeWidth={2} />
                    <span className="text-[18px] font-semibold text-[#FF6B00] leading-none">
                      {label}
                    </span>
                  </Link>
                );
              }

              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex flex-col items-center justify-center transition-all group px-2"
                >
                  <Icon className="h-[26px] w-[26px] text-[#555555] group-active:scale-95 transition-transform" strokeWidth={1.75} />
                  {/* Label below icon for inactive states to maintain spacing in the row */}
                  <span className="mt-1.5 text-[14px] font-medium text-[#555555]">
                    {label}
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
