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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 PARTNER PARITY E2E FIX — PART 2\n\nNow fix the runtime synchronization so EVERY partner behaves exactly like\n\nDeepak.\n\nUse the root cause found in PART 1.\n\n==================================================\n\n1. ONE AUTHORITATIVE FLOW\n\n==================================================\n\nAdmin assigns Partner X:\n\nADMIN ASSIGNMENT\n\n↓\n\nassignment database record\n\n↓\n\npartner_notifications record\n\n↓\n\nrealtime new_assignment\n\n↓\n\nPartner App receives event\n\n↓\n\nassignment query refresh\n\n↓\n\nHome / Available / Daily Route / Earnings update\n\n↓\n\nFCM push if valid token exists\n\nThis exact path must work for EVERY partner.\n\n==================================================\n\n2. PARTNER REALTIME\n\n==================================================\n\nWhen Admin assigns:\n\nemit:\n\nnew_assignment\n\nwith:\n\npartner_id\n\nassignment_id\n\nbooking_id\n\nservice_id\n\nvehicle_id\n\nVerify the event reaches the assigned Partner App.\n\nDo not special-case Deepak.\n\n==================================================\n\n3. PARTNER QUERY REFRESH\n\n==================================================\n\nAfter the realtime event, invalidate/refetch the actual queries used by:\n\nHome\n\nAvailable\n\nDaily Route\n\nToday's Assignment\n\nNotifications\n\nEarnings\n\nDo not invent new query keys.\n\nVerify the refetched query actually returns the new assignment.\n\n==================================================\n\n4. PARTNER HOME\n\n==================================================\n\nAfter assignment:\n\nHome immediately shows:\n\ncustomer\n\nvehicle\n\nservice\n\nassignment\n\ncustomer count\n\ndaily potential\n\nassignment state\n\nNo manual refresh.\n\n==================================================\n\n5. AVAILABLE / ASSIGNMENTS\n\n==================================================\n\nThe assigned partner must immediately see the booking in the Partner App.\n\nThis must come from the Admin-created assignment.\n\nDo NOT depend on marketplace_offers.\n\n==================================================\n\n6. DAILY ROUTE\n\n==================================================\n\nImmediately update:\n\ncustomer\n\nvehicle\n\nvehicle number\n\nservice time\n\narea\n\nlocation\n\nmap\n\nNext Stop\n\nUp Next\n\nremaining count\n\nNo manual refresh.\n\n==================================================\n\n7. IN-APP NOTIFICATION\n\n==================================================\n\nEvery assigned partner receives:\n\nNEW SERVICE ASSIGNED\n\nwith:\n\ncustomer\n\nvehicle\n\narea\n\nservice time\n\nThe notification must be linked to the exact assignment.\n\nPush failure must NOT prevent the in-app notification.\n\n==================================================\n\n8. PUSH NOTIFICATION\n\n==================================================\n\nIf a valid Partner FCM token exists:\n\nsend actual Android push.\n\nFor each tested partner record:\n\npartner_id\n\ntoken_count\n\nFirebase project\n\nFCM response\n\ndevice received\n\nOne invalid token must not affect another partner.\n\n==================================================\n\n9. EARNINGS / PROGRESS\n\n==================================================\n\nAfter assignment:\n\nshow assignment potential/expected earning.\n\nDo NOT mark service completed.\n\nAfter actual service completion:\n\nupdate actual earned amount and progress.\n\nHome, Route and Earnings must use the same authoritative service data.\n\n==================================================\n\n10. FCM FAILURE TEST\n\n==================================================\n\nDeliberately make Partner push unavailable.\n\nAdmin assigns the partner.\n\nExpected:\n\nPartner App STILL updates through database/realtime.\n\nThis proves the assignment system does not depend on FCM.\n\n==================================================\n\n11. FINAL MULTI-PARTNER TEST\n\n==================================================\n\nUse at least 4 partners:\n\nDeepak\n\nPartner A\n\nPartner B\n\nPartner C\n\nFor each one, Admin assigns a fresh Daily Shine booking.\n\nEach must receive:\n\n✓ database assignment\n\n✓ in-app notification\n\n✓ realtime update\n\n✓ Home update\n\n✓ Available update\n\n✓ Daily Route update\n\n✓ map update\n\n✓ earnings/assignment potential update\n\n✓ push if valid token exists\n\nAll four must use the exact same code/data path.\n\n==================================================\n\n12. SEARCH FOR SPECIAL-CASE LOGIC\n\n==================================================\n\nSearch the entire project for:\n\n9000000006\n\nDeepak\n\ndeepak\n\nThere must be NO partner-specific behavior.\n\nRemove any such special-case.\n\n==================================================\n\n13. FINAL FORENSIC REPORT\n\n==================================================\n\nFor Deepak + Partner A + Partner B + Partner C provide:\n\npartner_id\n\nassignment_id\n\nnotification row\n\nrealtime received\n\nquery refetch\n\nHome update\n\nAvailable update\n\nDaily Route update\n\nMap update\n\nEarnings update\n\nFCM response\n\nphysical push\n\nThen confirm:\n\nDeepak path = same implementation\n\nPartner A path = same implementation\n\nPartner B path = same implementation\n\nPartner C path = same implementation\n\nFINAL ACCEPTANCE:\n\nAdmin assigns ANY valid partner\n\n→ that partner immediately gets the assignment in-app\n\n→ Home updates\n\n→ Available updates\n\n→ Daily Route updates\n\n→ map updates\n\n→ earnings/assignment potential updates\n\n→ notification appears\n\n→ push works if a valid token exists.\n\nNO partner-specific exceptions.`;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-semibold tracking-tight">Urban Wash</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-pre-wrap">{replacementText}</span>
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