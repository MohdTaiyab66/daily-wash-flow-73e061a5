import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LogOut,
  ChevronRight,
  ClipboardList,
  Wallet,
  Headphones,
  Gift,
  MapPin,
  Info,
  FileText,
  Shield,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/c/_authed/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — Urban Wash" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["customer-profile-self"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("customer_profiles").select("*").maybeSingle();
      return data;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("uw_customer_vehicle");
    navigate({ to: "/c" });
  };

  const p = q.data;
  const name = p?.full_name ?? "Customer";
  const phone = p?.phone ?? "";

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="bg-primary px-5 pb-8 pt-8 text-primary-foreground">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <button onClick={() => navigate({ to: "/c/home" })} className="-ml-1 p-1">←</button>
          <span className="font-semibold">Profile</span>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-primary-foreground/15 text-3xl">
            <UserIcon className="h-9 w-9 opacity-90" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-2xl font-bold">{name}</div>
            <div className="text-sm opacity-80">{phone || "—"}</div>
            <Link to="/c/vehicles" className="mt-1 inline-flex items-center text-sm font-medium opacity-95">
              Edit profile <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div className="-mt-5 px-5">
        <div className="grid grid-cols-3 gap-3">
          <TileCard to="/c/bookings" icon={<ClipboardList className="h-5 w-5" />} label="My bookings" />
          <TileCard icon={<Wallet className="h-5 w-5" />} label="Wallet" badge="₹0" />
          <TileCard icon={<Headphones className="h-5 w-5" />} label="Help & Support" />
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-warning/15">
                <Gift className="h-5 w-5 text-warning-foreground" />
              </span>
              <div>
                <div className="text-sm font-semibold">Refer & earn</div>
                <div className="text-xs text-muted-foreground">Upto ₹100 per friend</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          <Row icon={<MapPin className="h-4 w-4" />} label="Saved addresses" />
          <Row icon={<Info className="h-4 w-4" />} label="About us" />
          <Row icon={<FileText className="h-4 w-4" />} label="Terms of services" />
          <Row icon={<Shield className="h-4 w-4" />} label="Privacy policy" />
          <Row icon={<Trash2 className="h-4 w-4" />} label="Request account deletion" />
          <button
            onClick={signOut}
            className="flex w-full items-center justify-between px-4 py-4 text-left text-sm hover:bg-muted/60"
          >
            <span className="flex items-center gap-3 text-destructive">
              <LogOut className="h-4 w-4" /> Log out
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">Urban Wash · v0.1</p>
      </div>
    </div>
  );
}

function TileCard({
  to,
  icon,
  label,
  badge,
}: {
  to?: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  const inner = (
    <div className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-3">
      {badge && (
        <span className="absolute right-2 top-2 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
          {badge}
        </span>
      )}
      <span className="text-foreground/80">{icon}</span>
      <span className="mt-3 text-sm font-medium leading-tight">{label}</span>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex w-full items-center justify-between px-4 py-4 text-left text-sm hover:bg-muted/60">
      <span className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
