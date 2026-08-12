import { Link, useLocation } from "@tanstack/react-router";
import { Home, Sparkles, Calendar, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = [
    { to: "/c/home", label: "Home", icon: Home },
    { to: "/c/subscriptions", label: "My plan", icon: Sparkles },
    { to: "/c/bookings", label: "Bookings", icon: Calendar },
    { to: "/c/profile", label: "Profile", icon: User },
  ] as const;

  const isCheckout = pathname.startsWith("/c/service/") || pathname.startsWith("/c/vehicles/add") || pathname.includes("/vehicles/");
  
  // Compact Premium Height: 72px
  return (
    <div className={cn(
      "min-h-screen bg-background pb-[calc(68px+env(safe-area-inset-bottom))]",
      isCheckout && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isCheckout && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.04)] bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-md items-center justify-between h-[68px] px-2">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
              
              if (active) {
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    aria-current="page"
                    className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-300"
                  >
                    <div className="flex items-center justify-center w-[82px] h-[44px] rounded-[22px] bg-[#FFF2E8] transition-all duration-300">
                      <div className="flex flex-col items-center justify-center">
                        <Icon className="h-[22px] w-[22px] text-[#FF6B00]" strokeWidth={1.75} />
                        <span className="mt-0.5 text-[12px] font-medium text-[#FF6B00] leading-none">
                          {n.label}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              }

              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex-1 flex flex-col items-center justify-center transition-all group h-full"
                >
                  <Icon className="h-[22px] w-[22px] text-[#8A8A8A] group-active:scale-95 transition-transform" strokeWidth={1.75} />
                  <span className="mt-1 text-[12px] font-medium text-[#8A8A8A] leading-none">
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
