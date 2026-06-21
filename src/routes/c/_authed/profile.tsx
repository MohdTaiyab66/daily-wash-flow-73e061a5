import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User, Phone, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <div className="mt-5 rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground text-lg font-semibold">
            {(p?.full_name?.[0] ?? "U").toUpperCase()}
          </div>
          <div>
            <div className="text-base font-semibold">{p?.full_name ?? "Customer"}</div>
            <div className="text-xs text-muted-foreground">{p?.phone ?? "—"}</div>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <Row icon={<User className="h-4 w-4" />} label="Name" value={p?.full_name ?? "—"} />
          <Row icon={<Phone className="h-4 w-4" />} label="Phone" value={p?.phone ?? "—"} />
          <Row icon={<MapPin className="h-4 w-4" />} label="Area" value={p?.preferred_area ?? "—"} />
        </div>
      </div>

      <Button variant="outline" className="mt-5 w-full text-destructive" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">Urban Wash · v0.1</p>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span>{label}</span></div>
      <span className="font-medium">{value}</span>
    </div>
  );
}
