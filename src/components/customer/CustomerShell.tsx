import { Link, useLocation } from "@tanstack/react-router";
import { Home, Sparkles, Calendar, User } from "lucide-react";
import type { ReactNode } from "react";

export function CustomerShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const nav = [
    { to: "/c/home", label: "Home", icon: Home },
    { to: "/c/subscriptions", label: "My Plan", icon: Sparkles },
    { to: "/c/bookings", label: "Bookings", icon: Calendar },
    { to: "/c/profile", label: "Profile", icon: User },
  ] as const;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-md">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || (n.to !== "/c/home" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* Active tab gets a filled pill + filled glyph — Material 3 style. */}
                <span
                  className={`grid h-8 w-14 place-items-center rounded-full transition-all duration-150 ${
                    active ? "bg-primary/12 scale-100" : "bg-transparent scale-95"
                  }`}
                >
                  <Icon
                    className="h-5 w-5 transition-transform duration-150"
                    {...(active ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
                  />
                </span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
