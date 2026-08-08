import { Link, useLocation } from "@tanstack/react-router";
import { Home, Sparkles, Calendar, User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = [
    { to: "/c/home", label: "Home", icon: Home },
    { to: "/c/subscriptions", label: "My Plan", icon: Sparkles },
    { to: "/c/bookings", label: "Bookings", icon: Calendar },
    { to: "/c/profile", label: "Profile", icon: User },
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
                  className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-0.5 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`grid h-7 w-16 place-items-center rounded-full transition-all duration-150 ${
                      active ? "bg-accent" : "bg-transparent"
                    }`}
                  >
                    <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
