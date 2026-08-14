import { createFileRoute, Outlet, Link, useLocation, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_NAV } from "@/components/admin/admin-nav";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, ChevronDown, LogOut, MapPin, Menu, PanelLeftClose, PanelLeft } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: true,
  head: () => ({ meta: [{ title: "Urban Wash · Admin" }] }),
  beforeLoad: async () => {
    // Admin gate – designed to NEVER sign the user out on transient errors
    // (network blips, refresh-token races). We only redirect to /auth when
    // there is definitively no session or the email is not an admin email.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth", search: { redirect: "/admin" } });
    const email = sess.session.user.email || "";
    if (!email.endsWith("@admin.urbanwash.app")) {
      throw redirect({ to: "/auth", search: { redirect: "/admin" } });
    }
    try {
      const { data: isAdmin, error } = await supabase.rpc("has_role", {
        _user_id: sess.session.user.id,
        _role: "admin",
      });
      if (!error && isAdmin === false) {
        throw redirect({ to: "/auth", search: { redirect: "/admin" } });
      }
    } catch {
      // swallow transient RPC errors – the session itself is valid
    }
  },
  component: AdminLayout,
});

function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ["admin-notifications-unread"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  return data ?? 0;
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { pathname, search } = useLocation();
  const activeGroup = ADMIN_NAV.find((g) =>
    g.items.some((i) => (i.exact ? pathname === i.to : pathname.startsWith(i.to))),
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeGroup) setOpen((p) => ({ ...p, [activeGroup.id]: true }));
  }, [activeGroup?.id]);

  return (
    <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto px-2 pb-6">
      {ADMIN_NAV.map((group) => {
        const isOpen = collapsed ? true : (open[group.id] ?? group.id === "dashboard");
        return (
          <div key={group.id} className="pt-1">
            {!collapsed && (
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [group.id]: !isOpen }))}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {group.label}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
            )}
            {isOpen && (
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const pathMatch = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                  const active = item.search
                    ? pathMatch && (search as any)?.f === item.search.f
                    : pathMatch;
                  return (
                    <Link
                      key={`${item.to}-${item.label}`}
                      to={item.to as any}
                      search={(item.search as any) ?? undefined}
                      onClick={onNavigate}
                      title={item.label}
                      className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors ${
                        collapsed ? "justify-center" : ""
                      } ${
                        active
                          ? "bg-primary/12 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/admin" className="flex items-center gap-2 px-4 py-5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
        UW
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight">Urban Wash</p>
          <p className="truncate text-[11px] text-muted-foreground">Admin Console</p>
        </div>
      )}
    </Link>
  );
}

function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const unread = useUnreadCount();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex ${
            collapsed ? "w-[72px]" : "w-64"
          }`}
        >
          <Brand collapsed={collapsed} />
          <NavList collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                <div className="flex h-full flex-col">
                  <Brand />
                  <NavList onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <GlobalSearch />
            </div>

            <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground lg:inline-flex">
              <MapPin className="h-3.5 w-3.5" /> Lucknow
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">{today}</span>

            <Link
              to="/admin/notifications"
              aria-label="Notifications"
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border hover:bg-muted"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary"
                  aria-label="Admin profile"
                >
                  {(email[0] ?? "A").toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {email || "Admin"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings">System settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/auth";
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
