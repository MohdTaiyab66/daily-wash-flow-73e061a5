import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, Gift, Share2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/_authed/referrals")({
  ssr: false,
  head: () => ({ meta: [{ title: "Refer & Earn — Urban Wash" }] }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const [code, setCode] = useState<string>("");

  const cfgQ = useQuery({
    queryKey: ["referral-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("referral_config").select("*").eq("active", true).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? "";
      setCode("UW" + uid.slice(0, 6).toUpperCase());
    })();
  }, []);

  const reward = cfgQ.data?.referrer_reward ?? 100;
  const friendReward = cfgQ.data?.referee_reward ?? 50;

  const copy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied");
  };

  const share = async () => {
    const text = `I'm using Urban Wash for doorstep car cleaning. Use my code ${code} for ₹${friendReward} off your first wash!`;
    if ((navigator as any).share) {
      try { await (navigator as any).share({ text, title: "Urban Wash" }); } catch {}
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Message copied — paste anywhere");
    }
  };

  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Refer & earn</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Earn ₹{reward} when a friend completes their first wash.
      </p>

      <div className="mt-6 rounded-3xl border border-border bg-gradient-to-br from-accent to-card p-6 text-center">
        <Gift className="mx-auto h-10 w-10 text-primary" />
        <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">Your code</p>
        <div className="mt-1 text-3xl font-bold tracking-widest">{code || "—"}</div>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={copy}>
            <Copy className="mr-1.5 h-4 w-4" /> Copy
          </Button>
          <Button className="flex-1 rounded-xl" onClick={share}>
            <Share2 className="mr-1.5 h-4 w-4" /> Share
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <Step n={1} title="Share your code">Send to friends via WhatsApp or any app.</Step>
        <Step n={2} title="They book their first wash">Using your code, they get ₹{friendReward} off.</Step>
        <Step n={3} title="You earn ₹{reward}">Credited to your wallet after they're cleaned.</Step>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">0 friends joined</div>
            <div className="text-xs text-muted-foreground">₹0 earned so far</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
