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
      "min-h-screen bg-[#FDFCFB] pb-[calc(140px+env(safe-area-inset-bottom))]", // Increased padding to avoid overlap with sticky CTA
      isFullScreen && "pb-0"
    )}>
      <div className="mx-auto max-w-md">{children}</div>
      
      {!isFullScreen && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.04)] bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
          <div className="mx-auto flex max-w-md items-center justify-between h-[70px] px-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to || (n.to !== "/app" && pathname.startsWith(n.to));
              
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex-1 flex flex-col items-center justify-center transition-all group h-full active:scale-90"
                >
                  <div className={cn(
                    "p-1.5 rounded-xl transition-all",
                    active ? "bg-[#FF6B00]/5" : ""
                  )}>
                    <Icon 
                      className={cn(
                        "h-[22px] w-[22px] transition-all", 
                        active ? "text-[#FF6B00]" : "text-[#8A8A8A]"
                      )} 
                      strokeWidth={active ? 2.5 : 2} 
                    />
                  </div>
                  <span className={cn(
                    "mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] transition-all whitespace-nowrap text-center px-0.5",
                    active ? "text-[#FF6B00]" : "text-[#8A8A8A]"
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
