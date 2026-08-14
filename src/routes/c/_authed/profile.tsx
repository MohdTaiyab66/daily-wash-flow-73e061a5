import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  LogOut,
  Car,
  Bell,
  MapPin,
  Info,
  FileText,
  Shield,
  Trash2,
  User as UserIcon,
  Headphones,
  Gift,
  ClipboardList,
  Pencil,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Shimmer } from "@/components/customer/ui/Skeletons";
import { ListGroup, ListRow, Section } from "@/components/customer/ui/kit";
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

export const Route = createFileRoute("/c/_authed/profile")({
  ssr: true,
  head: () => ({ meta: [{ title: "Profile — Urban Wash" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const q = useQuery({
    queryKey: ["customer-profile-self"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("customer_profiles").select("*").maybeSingle();
      return data;
    },
  });

  const signOut = async () => {
    // 1. Tear down realtime channels while the auth token is still valid.
    try {
      await supabase.removeAllChannels();
    } catch {
      /* non-fatal — proceed with sign-out */
    }
    // 2. End the Supabase session.
    await supabase.auth.signOut();
    // 3. Clear per-device UI state and the query cache.
    localStorage.removeItem("uw_customer_vehicle");
    queryClient.cancelQueries();
    queryClient.removeQueries();
    queryClient.clear();
    // 4. Verify cleanup — leftovers are a bug worth logging.
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
    <div className="min-h-screen bg-[#FFF9F3] pb-12">
      {/* Header */}
      <div className="px-6 pt-8">
        <h1 className="text-[28px] font-black tracking-tight text-[#1a1a1a]">Profile</h1>
        
        {/* Identity Hub */}
        <div className="mt-6 flex items-center gap-4 rounded-3xl bg-card p-5 shadow-sm border border-border/50">
          <div className="relative">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
              <UserIcon className="h-8 w-8" strokeWidth={2.5} />
            </div>
            <div className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-success border-2 border-white shadow-sm">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {q.isLoading ? (
              <div className="space-y-2">
                <Shimmer className="h-5 w-32 rounded-lg" />
                <Shimmer className="h-3.5 w-24 rounded-full" />
              </div>
            ) : (
              <>
                <div className="truncate text-[20px] font-black tracking-tight text-[#1a1a1a]">{name}</div>
                <div className="mt-0.5 text-[13px] font-medium text-muted-foreground">{phone || "No phone added"}</div>
              </>
            )}
          </div>
          <Link
            to="/c/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors active:bg-muted"
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-4 space-y-2 px-6">
        <Section title="Account" className="mt-6">
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
            <ListRow icon={Car} title="My Vehicles" subtitle="Manage your cars & tiers" to="/c/vehicles" className="border-b border-border/40" />
            <ListRow icon={ClipboardList} title="Service History" subtitle="Washes, photos & reports" to="/c/bookings" className="border-b border-border/40" />
            <ListRow icon={MapPin} title="Saved Addresses" subtitle="Manage service locations" to="/c/profile" className="border-b border-border/40" />
            <ListRow icon={Gift} title="Refer & Earn" subtitle="Get ₹100 for every friend" to="/c/referrals" />
          </div>
        </Section>

        <Section title="Settings & Privacy" className="mt-6">
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
            <ListRow icon={Bell} title="Notifications" to="/c/notifications" className="border-b border-border/40" />
            <ListRow icon={Shield} title="Privacy Policy" to="/c/profile" className="border-b border-border/40" />
            <ListRow icon={FileText} title="Terms of Service" to="/c/profile" />
          </div>
        </Section>

        <Section title="Support" className="mt-6">
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
            <ListRow icon={Headphones} title="Help Centre" to="/c/profile" className="border-b border-border/40" />
            <ListRow icon={Info} title="About Urban Wash" to="/c/profile" />
          </div>
        </Section>

        <div className="mt-8 space-y-3">
          <button
            onClick={() => setLogoutOpen(true)}
            className="uw-pressable flex w-full items-center justify-center gap-2.5 rounded-full bg-destructive/5 py-4 text-[15px] font-bold text-destructive transition-colors active:bg-destructive/10"
          >
            <LogOut className="h-4.5 w-4.5" />
            Log out
          </button>
          
          <button className="flex w-full items-center justify-center py-2 text-[12px] font-semibold text-muted-foreground/50 transition-colors hover:text-muted-foreground">
            Request account deletion
          </button>
        </div>

        <p className="mt-6 text-center text-[12px] font-bold tracking-widest text-muted-foreground/30 uppercase">
          Version 2.4.0
        </p>
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
