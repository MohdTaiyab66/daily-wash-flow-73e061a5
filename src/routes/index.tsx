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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            FINAL P0 VERIFICATION — DO NOT CLAIM FIXED WITHOUT REAL DEVICE EVIDENCE\n\nThe code now claims:\n\n- all eligible partners receive broadcasts\n\n- 30-second repeats\n\n- account-based customer push\n\n- atomic first-partner-wins\n\n- forensic FCM logging\n\nNow VERIFY this with a REAL end-to-end test.\n\nDo not make more architectural changes unless the test shows a failure.\n\n==================================================\n\nTEST 1 — PARTNER BROADCAST\n\n==================================================\n\nUse one real customer booking in an area with at least 3 eligible partners.\n\nRecord:\n\nbooking_id\n\narea\n\neligible_partner_ids\n\neligible_partner_count\n\nImmediately verify:\n\noffer_count == eligible_partner_count\n\nEach eligible partner must have an open offer.\n\nThen verify:\n\npartner_id\n\ntoken_count\n\nFCM result\n\nfor EVERY eligible partner.\n\nExpected:\n\nPartner A → offer + push\n\nPartner B → offer + push\n\nPartner C → offer + push\n\nNot just Deepak.\n\n==================================================\n\nTEST 2 — REPEAT\n\n==================================================\n\nNobody accepts the booking.\n\nVerify the 30-second repeat.\n\nEvery still-eligible partner must receive the repeat.\n\nIf a partner declined, apply the existing 5-minute suppression only to that\n\npartner.\n\nAll other eligible partners continue receiving the offer.\n\n==================================================\n\nTEST 3 — FIRST PARTNER WINS\n\n==================================================\n\nPartner B accepts.\n\nVerify:\n\nbooking accepted_partner_id = B\n\nAll competing offers become closed/superseded.\n\nNo further repeat push is sent.\n\nNo other partner can accept the same booking.\n\n==================================================\n\nTEST 4 — CUSTOMER PUSH\n\n==================================================\n\nAfter Partner B accepts:\n\nVerify customer push through the REAL Android device.\n\nThen complete the service.\n\nVerify customer receives a REAL Android system notification.\n\nDo NOT count an in-app notification as success.\n\nLog:\n\ncustomer_id\n\nvehicle_id\n\nservice_id\n\ncustomer_token_count\n\nFirebase project used\n\nFCM response\n\n==================================================\n\nTEST 5 — MULTI-VEHICLE\n\n==================================================\n\nUse a customer with 2+ vehicles.\n\nSelect Vehicle A in the Customer App.\n\nComplete a service for Vehicle B.\n\nExpected:\n\nCustomer still receives the push.\n\nNotification payload contains:\n\ncustomer_id\n\nvehicle_id = B\n\nservice_id\n\nTapping it opens Vehicle B/service details.\n\n==================================================\n\nTEST 6 — IF ANY TEST FAILS\n\n==================================================\n\nDo NOT say \"push pipeline fixed.\"\n\nIdentify exactly which layer failed:\n\n1. eligibility\n\n2. offer creation\n\n3. notification creation\n\n4. token lookup\n\n5. Firebase project selection\n\n6. FCM request\n\n7. Android delivery\n\n8. notification tap/deep link\n\nShow the actual failing log/FCM response and fix that layer.\n\n==================================================\n\nFINAL ACCEPTANCE\n\nThe task is complete ONLY when:\n\nALL eligible partners receive the same booking offer\n\n+\n\nrepeat broadcasts reach ALL still-eligible partners\n\n+\n\nfirst acceptance closes competing offers\n\n+\n\ncustomer receives actual Android push\n\n+\n\nmulti-vehicle customer receives push regardless of selected vehicle\n\n+\n\nreal device E2E passes.\n\nDo not rely on browser/in-app testing alone.`}</span>,,old_content:
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
