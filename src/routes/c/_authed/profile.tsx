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
  ssr: false,
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
    <div className="px-5 pb-8 pt-6">
      <h1 className="text-[26px] font-bold tracking-tight">Profile</h1>

      {/* Identity */}
      <div className="mt-5 flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <UserIcon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          {q.isLoading ? (
            <>
              <Shimmer className="h-5 w-36 rounded-lg" />
              <Shimmer className="mt-2 h-3.5 w-28 rounded-full" />
            </>
          ) : (
            <>
              <div className="truncate text-[19px] font-bold tracking-tight">{name}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">{phone || "—"}</div>
            </>
          )}
        </div>
        <Link
          to="/c/vehicles"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-4 text-[13px] font-semibold"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
      </div>

      <Section title="Your account">
        <ListGroup>
          <ListRow icon={Car} title="Vehicles" to="/c/vehicles" />
          <ListRow icon={ClipboardList} title="Bookings" to="/c/bookings" />
          <ListRow icon={Bell} title="Notifications" to="/c/notifications" />
          <ListRow icon={Car} title="Saved packages" to="/c/profile" />
          <ListRow icon={Gift} title="Refer & earn" subtitle="Up to ₹100 per friend" to="/c/referrals" />
        </ListGroup>
      </Section>

      <Section title="Help & support">
        <ListGroup>
          <ListRow icon={Headphones} title="Help centre" chevron />
          <ListRow icon={MapPin} title="Saved addresses" chevron />
        </ListGroup>
      </Section>

      <Section title="More">
        <ListGroup>
          <ListRow icon={Info} title="About Urban Wash" />
          <ListRow icon={FileText} title="Terms of service" />
          <ListRow icon={Shield} title="Privacy policy" />
          <ListRow icon={Trash2} title="Request account deletion" />
        </ListGroup>
      </Section>

      <button
        onClick={() => setLogoutOpen(true)}
        className="uw-pressable mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-destructive/30 py-3 text-[14px] font-semibold text-destructive"
      >
        <LogOut className="h-4 w-4" /> Log out
      </button>

      <p className="mt-6 text-center text-[11.5px] text-muted-foreground">Urban Wash</p>

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
