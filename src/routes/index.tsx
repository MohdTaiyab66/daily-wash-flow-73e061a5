import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Car, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import { useEffect } from "react";
import logo from "@/assets/logo.jpeg";
import { isNative, appVariant } from "@/lib/platform";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Urban Wash — Doorstep Car Care, Every Morning" },
      { name: "description", content: "Hyperlocal daily car cleaning in Lucknow. Partner & Admin tools for the Urban Wash team." },
      { property: "og:title", content: "Urban Wash" },
      { property: "og:description", content: "Doorstep car care, every morning." },
    ],
  }),
  component: Index,
});

function Index() {
  // Native APK shells skip the role-picker landing and open directly into
  // the variant's app (Customer APK → /c, Partner APK → /auth → /app).
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative()) return;
    const v = appVariant();
    navigate({ to: v === "customer" ? "/c" : "/auth", replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-semibold tracking-tight">Urban Wash</span>
        </div>
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 FIX — MARKETPLACE BROADCAST + CUSTOMER PUSH\n\nDo not make UI changes.\n\nCurrent real bug:\n\nCustomer books Daily Shine in an area.\n\nOnly Deepak receives the offer.\n\nOther eligible partners in the same area receive nothing:\n\n- no push\n\n- no in-app offer\n\n- no Available Work\n\n- no background notification\n\nCustomer also receives no actual Android push for service events.\n\nFIX E2E.\n\n1. ELIGIBLE PARTNERS\n\nFor every new paid booking, query ALL currently eligible partners for the customer's selected service area.\n\nDo NOT limit to:\n\n- first partner\n\n- nearest partner\n\n- LIMIT 1\n\n- .first()\n\n- .single()\n\n- one partner per round\n\n- previously notified partner\n\nEvery eligible partner must receive the same open offer.\n\n2. OFFER CREATION\n\nFor one booking:\n\neligible partners = N\n\nCreate/open offer state for ALL N partners.\n\nIf eligible = 5, there must be 5 eligible offer records/states.\n\nDo not let one partner's notification failure remove another partner's offer.\n\n3. REPEAT BROADCAST\n\nIf nobody accepts:\n\nbroadcast again to ALL still-eligible partners every 30 seconds.\n\nA partner who declined can be suppressed for the existing 5-minute period,\n\nbut all other eligible partners must continue receiving the offer.\n\nA partner who logs in later must recover the still-open offer immediately.\n\nStop all repeats immediately when one partner accepts.\n\n4. ATOMIC ACCEPTANCE\n\nFirst valid partner wins.\n\nUse the existing atomic acceptance RPC.\n\nAfter acceptance:\n\n- accepted partner keeps the booking\n\n- all competing offers become closed/superseded\n\n- no other partner can accept it\n\n- repeat notifications stop\n\n5. FORENSIC LOGGING\n\nFor one real booking log:\n\nbooking_id\n\narea_id/name\n\neligible_partner_ids\n\neligible_count\n\noffer_partner_ids\n\noffer_count\n\nnotification_partner_ids\n\nFCM token count per partner\n\nFCM response per partner\n\nThis is required because only Deepak is currently receiving the offer.\n\n6. CUSTOMER PUSH\n\nCustomer currently gets in-app notifications but no Android push.\n\nTrace:\n\nservice event\n\n→ customer account lookup\n\n→ customer device tokens\n\n→ CUSTOMER Firebase credentials\n\n→ FCM request\n\n→ FCM response\n\n→ Android device\n\nDo NOT treat database notification creation as successful push delivery.\n\nLog the actual FCM response.\n\n7. MULTI-VEHICLE CUSTOMER\n\nPush recipient must be the CUSTOMER ACCOUNT, not the currently selected vehicle.\n\nIf customer owns 3 vehicles, an event for ANY vehicle must send to the\n\ncustomer's active device tokens.\n\nPayload must include:\n\ncustomer_id\n\nvehicle_id\n\nservice_id\n\nnotification_type\n\nTapping the notification must open the correct vehicle/service.\n\n8. REAL DEVICE TEST\n\nUse:\n\n- 3+ eligible partner Android devices\n\n- 1 customer Android device\n\nTest:\n\nCustomer books\n\n→ ALL eligible partners receive push\n\nWait\n\n→ ALL still-eligible partners receive repeat\n\nOne partner accepts\n\n→ competing offers close\n\nCustomer receives accepted push\n\nPartner completes service\n\n→ customer receives completed push\n\nTest another vehicle while a different vehicle is selected in Customer App.\n\nDO NOT declare fixed from browser/in-app testing.\n\nThe final proof must be:\n\neligible partners\n\n→ offers created for all\n\n→ push sent to all\n\n→ actual Android devices receive it.`}</span>,,old_content:
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-12 pb-24">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Doorstep car care</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-6xl">
            Every car, sparkling<br />by sunrise.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Urban Wash is rebuilding morning car care across Lucknow. Choose the workspace you need.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <RoleCard
            to="/c"
            title="Customer App"
            subtitle="Book daily car cleaning, manage subscriptions, see service photos."
            icon={<Sparkles className="h-6 w-6" />}
            cta="Open Customer App"
            tone="orange"
          />
          <RoleCard
            to="/auth"
            title="Partner App"
            subtitle="Login with your phone, select your cars, complete daily services."
            icon={<Car className="h-6 w-6" />}
            cta="Open Partner App"
          />
          <RoleCard
            to="/auth"
            search={{ redirect: "/admin" }}
            title="Admin Dashboard"
            subtitle="Manage partners, customers, services and payouts."
            icon={<ShieldCheck className="h-6 w-6" />}
            cta="Open Admin"
            tone="ink"
          />
        </div>

        <div className="mt-16 grid grid-cols-2 gap-6 text-sm text-muted-foreground md:grid-cols-4">
          <Stat k="140+" v="Active customers" />
          <Stat k="₹17" v="Per-car payout" />
          <Stat k="15/20/25" v="Assignment sizes" />
          <Stat k="8-photo" v="Before + after proof" />
        </div>
      </main>
    </div>
  );
}

function RoleCard({ to, search, title, subtitle, icon, cta, tone = "light" }: { to: string; search?: any; title: string; subtitle: string; icon: React.ReactNode; cta: string; tone?: "light" | "ink" | "orange" }) {
  const toneClass =
    tone === "ink" ? "bg-foreground text-background border-foreground"
    : tone === "orange" ? "bg-primary text-primary-foreground border-primary"
    : "bg-card text-foreground border-border";
  const iconClass =
    tone === "ink" ? "bg-background/10 text-background"
    : tone === "orange" ? "bg-background/15 text-primary-foreground"
    : "bg-accent text-accent-foreground";
  const subClass =
    tone === "ink" ? "text-background/70"
    : tone === "orange" ? "text-primary-foreground/85"
    : "text-muted-foreground";
  return (
    <Link
      to={to}
      search={search}
      className={`group flex flex-col justify-between rounded-3xl border p-7 transition-all hover:-translate-y-0.5 hover:shadow-lg ${toneClass}`}
    >
      <div>
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${iconClass}`}>
          {icon}
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className={`mt-2 text-sm ${subClass}`}>{subtitle}</p>
      </div>
      <div className="mt-8 inline-flex items-center gap-1 text-sm font-medium">
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tracking-tight text-foreground">{k}</div>
      <div className="mt-1">{v}</div>
    </div>
  );
}
