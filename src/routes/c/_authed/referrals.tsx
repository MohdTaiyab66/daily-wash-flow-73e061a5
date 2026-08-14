import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, Gift, Share2, Users, ArrowLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Section, Surface, ListRow, ListGroup } from "@/components/customer/ui/kit";

export const Route = createFileRoute("/c/_authed/referrals")({
  ssr: true,
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
    <div className="min-h-screen bg-[#FFF9F3] pb-10">
      <div className="sticky top-0 z-20 bg-[#FFF9F3]/95 px-5 pt-6 pb-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            to="/c/profile"
            className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
          >
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
          </Link>
          <h1 className="text-[24px] font-black tracking-tight text-[#1a1a1a]">Refer & Earn</h1>
        </div>
      </div>

      <div className="px-5">
        <Surface className="mt-4 overflow-hidden border-primary/20 bg-gradient-to-br from-[#FFF5ED] to-white p-6 shadow-sm">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
          <div className="flex flex-col items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-white shadow-sm mb-4">
              <Gift className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-[20px] font-black tracking-tight text-[#1a1a1a]">Earn ₹{reward} per friend</h2>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-muted-foreground/80">
              When they complete their first wash using your code, they get ₹{friendReward} off and you get ₹{reward}!
            </p>
            
            <div className="mt-6 w-full">
              <div className="rounded-2xl bg-white border border-black/5 p-4 shadow-sm">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Your unique code</span>
                <div className="mt-1 flex items-center justify-center gap-4">
                  <span className="text-[28px] font-black tracking-[0.15em] text-[#1a1a1a]">{code || "—"}</span>
                  <button onClick={copy} className="p-2 text-primary active:opacity-60 transition-opacity">
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <Button onClick={share} className="mt-4 h-14 w-full rounded-2xl font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                <Share2 className="mr-2 h-5 w-5" /> Share Reward Code
              </Button>
            </div>
          </div>
        </Surface>

        <Section title={<span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">How it works</span>} className="mt-8">
          <ListGroup className="bg-white">
            <StepRow n={1} title="Share your code" subtitle="Send it to friends via WhatsApp or any app." />
            <StepRow n={2} title="They book a wash" subtitle={`They get ₹${friendReward} off their first booking.`} />
            <StepRow n={3} title="You get rewarded" subtitle={`₹${reward} credited to your wallet after completion.`} />
          </ListGroup>
        </Section>

        <Section title={<span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">Your referrals</span>} className="mt-8">
          <Surface className="bg-white">
             <div className="flex items-center gap-4">
               <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/5 text-primary">
                 <Users className="h-6 w-6" />
               </div>
               <div>
                 <span className="block text-[15px] font-black text-[#1a1a1a]">0 Friends Joined</span>
                 <span className="mt-0.5 block text-[13px] font-medium text-muted-foreground/60">₹0 earned so far</span>
               </div>
             </div>
          </Surface>
        </Section>
      </div>
    </div>
  );
}

function StepRow({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-4 p-4 border-b last:border-0 border-black/5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[13px] font-black text-primary">
        {n}
      </div>
      <div>
        <h4 className="text-[15px] font-black text-[#1a1a1a]">{title}</h4>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground/60 leading-relaxed">{subtitle}</p>
      </div>
    </div>
  );
}
