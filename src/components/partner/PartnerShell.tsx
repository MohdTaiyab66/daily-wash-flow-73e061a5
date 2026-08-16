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
      "min-h-screen bg-[#FDFCFB] pb-[calc(140px+env(safe-area-inset-bottom))]",
      isFullScreen && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isFullScreen && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.06)] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
          <div className="mx-auto flex max-w-md items-center justify-between h-[70px] px-2">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/app" && pathname.startsWith(n.to));
              
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex-1 flex flex-col items-center justify-center transition-all h-full active:scale-95 group"
                >
                  <div className={cn(
                    "relative p-2 rounded-full transition-all duration-300",
                    active ? "bg-[#FF6B00] text-white shadow-lg shadow-[#FF6B00]/20" : "text-[#8A8A8A] group-hover:text-[#1A1A1A]"
                  )}>
                    <Icon 
                      className="h-[20px] w-[20px]" 
                      strokeWidth={active ? 2.5 : 2} 
                    />
                  </div>
                  <span className={cn(
                    "mt-1.5 text-[10px] font-black tracking-tight transition-all whitespace-nowrap text-center uppercase",
                    active ? "text-[#1A1A1A]" : "text-[#8A8A8A]"
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
