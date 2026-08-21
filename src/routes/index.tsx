import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import logo from "@/assets/logo.jpeg";
import { isNative, appVariant } from "@/lib/platform";
import { Car, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";

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
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative()) return;
    const v = appVariant();
    navigate({ to: v === "customer" ? "/c" : "/auth", replace: true });
  }, [navigate]);

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n\nURBAN WASH — P0 ADMIN E2E AUDIT — PART 1\n\nDO NOT make unrelated UI changes.\n\nThe new Admin Controlled Daily Shine flow is NOT connected correctly.\n\nCURRENT REAL PROBLEM:\n\nCustomer books Daily Shine.\n\nAdmin receives:\n\n\"New Daily Shine Subscription (paid)\"\n\nBut when I click \"Open\", it currently goes to:\n\n/admin/marketplace\n\nshowing the old:\n\nDaily Shine Marketplace\n\nAwaiting\n\nOffered\n\nBroadcasted\n\nAssigned\n\nThis is WRONG.\n\nThe new paid Daily Shine booking must open the EXACT booking assignment\n\nscreen so Admin can assign a partner.\n\nAlso, NO notification sound was heard when the new booking arrived.\n\nBefore making changes, AUDIT THE EXISTING ADMIN SYSTEM completely.\n\n==================================================\n\n1. AUDIT EXISTING ADMIN FEATURES\n\n==================================================\n\nInspect and understand the current implementations of:\n\n- Dashboard\n\n- Notifications\n\n- Bookings\n\n- Daily Shine\n\n- Daily Shine Offers\n\n- Live Offers\n\n- Marketplace\n\n- Assignments\n\n- Services\n\n- Payments\n\n- Partner management\n\n- Customer management\n\n- Admin realtime notifications\n\n- Admin sound/alerts\n\n- Existing booking detail routes\n\n- Existing assignment routes\n\n- Existing marketplace RPCs\n\n- Existing notification routing\n\nIdentify which parts are currently authoritative.\n\nDO NOT create duplicate systems.\n\n==================================================\n\n2. TRACE THE CURRENT BOOKING FLOW\n\n==================================================\n\nTrace exactly:\n\nCUSTOMER BOOKING\n\n→ PAYMENT SUCCESS\n\n→ BOOKING RECORD\n\n→ ADMIN NOTIFICATION\n\n→ OPEN ACTION\n\n→ CURRENT ROUTE\n\n→ MARKETPLACE / ASSIGNMENT\n\n→ PARTNER ASSIGNMENT\n\nExplain why clicking \"Open\" currently sends me to:\n\n/admin/marketplace\n\ninstead of the new assignment screen.\n\n==================================================\n\n3. FIX THE OPEN ACTION\n\n==================================================\n\nFor a NEW PAID DAILY SHINE booking that is still UNASSIGNED:\n\nOpen must go directly to:\n\n/admin/assign-booking/:bookingId\n\nor the existing authoritative assignment route.\n\nThe booking ID must come from the actual admin notification.\n\nDo NOT use:\n\n- latest booking\n\n- first booking\n\n- cached booking\n\n- hardcoded booking\n\n- current booking\n\nThe notification must open the exact booking that created the notification.\n\n==================================================\n\n4. FIX ADMIN SOUND / ALERT\n\n==================================================\n\nWhen a genuinely NEW paid Daily Shine booking arrives:\n\nAdmin must receive:\n\n- unread badge increase\n\n- visible alert/toast\n\n- notification sound\n\nInspect the existing implementation in:\n\nsrc/routes/admin.tsx\n\nand the realtime admin_notifications subscription.\n\nSound must play once per new notification.\n\nDo NOT replay sound because of:\n\n- refresh\n\n- rerender\n\n- reconnect\n\n- opening notification page\n\n- polling\n\n- tab switching\n\nIf browser audio permission requires prior interaction, handle that correctly,\n\nbut the unread badge and visible alert must still work.\n\n==================================================\n\n5. CHECK OLD MARKETPLACE INTERFERENCE\n\n==================================================\n\nThe existing Admin Console still contains:\n\nDaily Shine Offers\n\nLive Offers\n\nMarketplace\n\nAwaiting\n\nOffered\n\nBroadcasted\n\nAssigned\n\nDetermine whether these old systems are still intercepting Daily Shine\n\nbookings.\n\nFor the NEW Admin-controlled Daily Shine flow:\n\nDO NOT auto-broadcast or auto-assign the booking.\n\nThe booking must remain:\n\nPAID / UNASSIGNED\n\nuntil Admin explicitly assigns a partner.\n\nThe old marketplace must NOT race with the Admin assignment flow.\n\n==================================================\n\n6. REQUIRED REPORT BEFORE PART 2\n\n==================================================\n\nReport:\n\n1. Why \"Open\" routes to /admin/marketplace\n\n2. Which existing function creates the click action\n\n3. Which route should be authoritative\n\n4. Why the Admin sound did not play\n\n5. Whether old marketplace logic is intercepting Daily Shine\n\n6. Exact files/functions involved\n\n7. Exact files/functions you changed\n\n8. Commit SHA\n\nDo NOT redesign the system.\n\nPART 1 is complete only when:\n\nNEW PAID DAILY SHINE\n\n→ ADMIN NOTIFICATION\n\n→ SOUND + ALERT\n\n→ OPEN\n\n→ EXACT BOOKING ASSIGNMENT SCREEN\n\nworks with a fresh real booking.`;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-semibold tracking-tight">Urban Wash</span>
        </div>
        <span className="text-xs text-muted-foreground">{replacementText}</span>
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
