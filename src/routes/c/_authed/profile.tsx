import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  Bug,
  FileDown,
  Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shimmer } from "@/components/customer/ui/Skeletons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { toast } from "sonner";

export const Route = createFileRoute("/c/_authed/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — Urban Wash" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const q = useQuery({
    queryKey: ["customer-profile-self"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("customer_profiles").select("*").maybeSingle();
      return data;
    },
  });

  const signOut = async () => {
    // 1. Tear down realtime channels while the auth token is still valid so
    //    unsubscribe frames reach the server (prevents ghost subscriptions
    //    from continuing to receive the previous user's rows after sign-out).
    try {
      await supabase.removeAllChannels();
    } catch {
      /* non-fatal — proceed with sign-out */
    }
    // 2. End the Supabase session (clears auth storage + broadcasts SIGNED_OUT).
    await supabase.auth.signOut();
    // 3. Clear per-device UI state and the TanStack Query cache so no
    //    previously-signed-in user's data can flash on next sign-in.
    localStorage.removeItem("uw_customer_vehicle");
    queryClient.cancelQueries();
    queryClient.removeQueries();
    queryClient.clear();
    // 4. Verify: any leftover channel or cached query is a bug — log so QA
    //    catches regressions; user still lands on the public entry.
    const leakedChannels = supabase.getChannels().length;
    const leakedQueries = queryClient.getQueryCache().getAll().length;
    if (leakedChannels > 0 || leakedQueries > 0) {
      console.warn("[signOut] cleanup incomplete", { leakedChannels, leakedQueries });
    }
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
            {q.isLoading ? (
              <>
                <Shimmer className="h-7 w-40 rounded-lg opacity-40" />
                <Shimmer className="mt-2 h-4 w-28 rounded-full opacity-40" />
              </>
            ) : (
              <>
                <div className="truncate text-2xl font-bold">{name}</div>
                <div className="text-sm opacity-80">{phone || "—"}</div>
              </>
            )}
            <Link to="/c/vehicles" className="mt-1 inline-flex items-center text-sm font-medium opacity-95">
              My vehicles <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div className="-mt-5 px-5">
        <div className="grid grid-cols-3 gap-3">
          <TileCard to="/c/bookings" icon={<ClipboardList className="h-5 w-5" />} label="My bookings" />
          <TileCard to="/c/subscriptions" icon={<Wallet className="h-5 w-5" />} label="Subscriptions" />
          <TileCard to="/c/notifications" icon={<Bell className="h-5 w-5" />} label="Notifications" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <TileCard icon={<Headphones className="h-5 w-5" />} label="Help & Support" />
        </div>

        <Link to="/c/referrals" className="mt-3 block rounded-2xl border border-border bg-card p-4">
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
        </Link>

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          <Row icon={<MapPin className="h-4 w-4" />} label="Saved addresses" />
          <Row icon={<Info className="h-4 w-4" />} label="About us" />
          <Row icon={<FileText className="h-4 w-4" />} label="Terms of services" />
          <Row icon={<Shield className="h-4 w-4" />} label="Privacy policy" />
          <Row icon={<Trash2 className="h-4 w-4" />} label="Request account deletion" />

          <button
            onClick={() => setLogoutOpen(true)}
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

      {/* Destructive action always asks first. */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of Urban Wash?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need your mobile number and an OTP to sign back in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={signOut}
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between px-4 py-4 text-left text-sm hover:bg-muted/60">
      <span className="flex items-center gap-3">
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
