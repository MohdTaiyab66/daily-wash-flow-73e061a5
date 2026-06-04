import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, BookOpen, Headphones, Share2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { data: partner } = useQuery({
    queryKey: ["me-partner-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("partners").select("*").eq("id", u.user!.id).maybeSingle();
      return data;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      <Card className="mt-5 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground text-lg font-semibold">
            {partner?.full_name?.[0] ?? "U"}
          </div>
          <div>
            <p className="font-semibold">{partner?.full_name ?? "Partner"}</p>
            <p className="text-xs text-muted-foreground">+91 {partner?.phone}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-primary">{partner?.partner_code}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 border-t border-border pt-4 text-center">
          <div><p className="text-lg font-semibold">{partner?.cars_selected ?? 0}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cars</p></div>
          <div><p className="text-lg font-semibold">{Number(partner?.rating ?? 5).toFixed(2)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rating</p></div>
          <div><p className="text-lg font-semibold capitalize">{partner?.status?.replace("_", " ")}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p></div>
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        <Row icon={<BookOpen className="h-4 w-4" />} label="Training & SOPs" />
        <Row icon={<Share2 className="h-4 w-4" />} label={`Refer & earn · ${partner?.referral_code ?? ""}`} />
        <Row icon={<Headphones className="h-4 w-4" />} label="Help & support" />
      </div>

      <Button variant="outline" className="mt-6 w-full" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3"><span className="text-muted-foreground">{icon}</span><span className="text-sm">{label}</span></div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Card>
  );
}
