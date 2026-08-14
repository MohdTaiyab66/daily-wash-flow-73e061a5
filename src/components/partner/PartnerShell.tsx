import { Link, useLocation } from "@tanstack/react-router";
import { Home, Briefcase, Wallet, Gift, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PartnerShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = [
    { to: "/app", label: "Home", icon: Home },
    { to: "/app/assignments", label: "Available", icon: Briefcase },
    { to: "/app/earnings", label: "Earnings", icon: Wallet },
    { to: "/app/rewards", label: "Rewards", icon: Gift },
    { to: "/app/profile", label: "Profile", icon: User },
  ] as const;

  const isFullScreen = pathname.startsWith("/app/live") || pathname.startsWith("/app/area");
  
  // Compact Premium Height: 70px (Matching Customer App)
  return (
    <div className={cn(
      "min-h-screen bg-[#F8F9FA] pb-[calc(70px+env(safe-area-inset-bottom))]",
      isFullScreen && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isFullScreen && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.04)] bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-md items-center justify-between h-[70px] px-1">
            {nav.map((n) => {
              const Icon = n.icon;
              // Check if path matches exactly or starts with it (for nested pages)
              const active = pathname === n.to || (n.to !== "/app" && pathname.startsWith(n.to));
              
              if (active) {
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    aria-current="page"
                    className="flex-1 flex flex-col items-center justify-center h-full transition-all duration-300"
                  >
                    <div className="flex items-center justify-center w-[64px] h-[40px] rounded-[20px] bg-[#FFF5EF] transition-all duration-300">
                      <div className="flex flex-col items-center justify-center">
                        <Icon className="h-[20px] w-[20px] text-[#FF6B00]" strokeWidth={2} />
                        <span className="text-[10px] font-bold text-[#FF6B00] leading-tight">
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
                  <Icon className="h-[20px] w-[20px] text-[#8A8A8A] group-active:scale-95 transition-transform" strokeWidth={2} />
                  <span className="mt-1 text-[10px] font-medium text-[#8A8A8A] leading-tight">
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
