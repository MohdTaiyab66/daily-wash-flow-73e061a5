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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 MARKETPLACE FIX — PART 2\n\nNow fix the actual offer creation, broadcast, repeat notification and FCM\n\ndelivery for ALL eligible partners.\n\nPart 1 established the correct eligible partner set.\n\n==================================================\n\n1. OFFER CREATION\n\n==================================================\n\nFor every eligible partner, create/open the booking offer.\n\nExample:\n\nEligible = 5\n\nExpected open offers:\n\nPartner A → OPEN\n\nPartner B → OPEN\n\nPartner C → OPEN\n\nPartner D → OPEN\n\nPartner E → OPEN\n\nIf 5 are eligible but only 1 offer exists, fix offer creation.\n\nDo not create only one offer for a broadcast.\n\n==================================================\n\n2. AVAILABLE WORK\n\n==================================================\n\nEvery eligible partner must see the same open booking in:\n\nAvailable Work\n\neven if:\n\n- push is unavailable\n\n- app was closed\n\n- partner was logged out\n\nLogin recovery must return the still-open booking.\n\n==================================================\n\n3. IMMEDIATE PUSH BROADCAST\n\n==================================================\n\nWhen the booking becomes available:\n\nsend push to ALL eligible partner device tokens.\n\nFor every partner log:\n\npartner_id\n\ntoken_count\n\nFirebase project\n\nFCM request\n\nFCM response\n\nDo not stop after Deepak succeeds.\n\nOne failed token must not stop other partners.\n\n==================================================\n\n4. 30-SECOND REPEAT\n\n==================================================\n\nIf nobody accepts:\n\nEvery 30 seconds:\n\n1. Check booking is still OPEN.\n\n2. Recalculate eligible partners.\n\n3. Exclude only partners who should no longer receive it.\n\n4. Broadcast to ALL remaining eligible partners.\n\nA repeat must NOT target only the partner who received the first push.\n\nExample:\n\nRound 1:\n\nA B C D E\n\nRound 2:\n\nA B C D E\n\nRound 3:\n\nA B C D E\n\nuntil one accepts.\n\n==================================================\n\n5. DECLINE RULE\n\n==================================================\n\nIf Partner B declines:\n\nPartner B may be suppressed for the existing 5-minute rule.\n\nBut:\n\nA C D E\n\nmust continue receiving the offer every 30 seconds.\n\nAfter the suppression period:\n\nB becomes eligible again if the booking is still open.\n\n==================================================\n\n6. FIRST PARTNER WINS\n\n==================================================\n\nWhen any partner accepts:\n\nUse the existing atomic acceptance RPC.\n\nExample:\n\nPartner C accepts.\n\nThen:\n\naccepted_partner_id = C\n\nAll other offers become:\n\nSUPERSEDED / CLOSED\n\nNo further repeat pushes.\n\nNo other partner can accept.\n\n==================================================\n\n7. CUSTOMER PUSH\n\n==================================================\n\nCustomer push is ALSO currently broken.\n\nTrace:\n\nservice event\n\n→ customer account\n\n→ customer device tokens\n\n→ Customer Firebase project\n\n→ FCM send\n\n→ Android device\n\nA database/in-app notification does NOT equal push delivery.\n\nLog actual FCM responses.\n\n==================================================\n\n8. MULTI-VEHICLE CUSTOMER\n\n==================================================\n\nCustomer push recipient must be the CUSTOMER ACCOUNT.\n\nIf customer owns:\n\nVehicle A\n\nVehicle B\n\nVehicle C\n\nand Vehicle B has a service event while Vehicle A is selected:\n\nCustomer must still receive the push.\n\nPayload must include:\n\ncustomer_id\n\nvehicle_id\n\nservice_id\n\nnotification_type\n\nTapping the push must open Vehicle B/service details.\n\n==================================================\n\n9. FINAL REAL-DEVICE TEST\n\n==================================================\n\nUse:\n\n3+ real eligible Partner Android devices/accounts\n\n+\n\n1 real Customer Android device\n\nTest:\n\n1. Customer books service.\n\n2. ALL eligible partners receive initial push.\n\n3. ALL eligible partners see offer in Available Work.\n\n4. Nobody accepts.\n\n5. Wait for 30-second repeat.\n\n6. ALL still-eligible partners receive repeat.\n\n7. One partner accepts.\n\n8. All competing offers close.\n\n9. Customer receives acceptance push.\n\n10. Partner completes service.\n\n11. Customer receives completion push.\n\n12. Test another vehicle while a different vehicle is selected.\n\n13. Customer still receives push.\n\n==================================================\n\n10. FORENSIC OUTPUT REQUIRED\n\n==================================================\n\nFor ONE real booking provide:\n\nELIGIBLE:\n\ncount + partner IDs\n\nOFFERS:\n\ncount + partner IDs\n\nNOTIFICATIONS:\n\ncount + partner IDs\n\nTOKENS:\n\ncount per partner\n\nFCM:\n\nsuccess/failure per partner\n\nFor customer:\n\ncustomer_id\n\nvehicle_id\n\nservice_id\n\ntoken_count\n\nFirebase project\n\nFCM response\n\nDo not say \"push sent\" unless the FCM request actually succeeded.\n\n==================================================\n\nFINAL ACCEPTANCE\n\n==================================================\n\nFIXED means:\n\nALL eligible area partners\n\n→ receive offer\n\nALL still-eligible partners\n\n→ receive repeated offer every 30 seconds\n\nFIRST ACCEPTANCE\n\n→ closes competing offers\n\nCUSTOMER\n\n→ receives actual Android push notifications\n\nMULTI-VEHICLE\n\n→ notifications work regardless of selected vehicle.\n\nDo not declare success from browser/in-app testing alone.`}</span>,,old_content:
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
