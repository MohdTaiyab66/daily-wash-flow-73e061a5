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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 FORENSIC MARKETPLACE FIX — PART 1\n\nDO NOT MAKE UI CHANGES.\n\nCurrent real problem:\n\nCustomer books Daily Shine in an area.\n\nOnly Deepak (9000000006) receives the booking offer.\n\nOther partners working in the SAME area receive:\n\n- no push\n\n- no in-app offer\n\n- no Available Work\n\n- no login recovery offer\n\nFind the exact root cause.\n\n==================================================\n\n1. TEST ONE REAL BOOKING\n\n==================================================\n\nUse one real failing Daily Shine booking.\n\nRecord:\n\nbooking_id\n\ncustomer_id\n\nvehicle_id\n\narea_id\n\narea_name\n\nThen identify ALL partners who should be eligible.\n\n==================================================\n\n2. FORENSIC ELIGIBILITY CHECK\n\n==================================================\n\nFor EVERY partner in that area, check:\n\npartner_id\n\npartner_name\n\nactive\n\napproved\n\narea_id\n\nselected_work_area\n\narea_match\n\nservice_type_match\n\nworking_day\n\nworking_hours\n\nactive_assignment_conflict\n\ndeclined_recently\n\nblocked\n\nFINAL eligible result\n\nCreate a diagnostic result like:\n\nDeepak | area YES | active YES | time YES | conflict NO | ELIGIBLE YES\n\nPartner B | area YES | active YES | time YES | conflict NO | ELIGIBLE YES\n\nPartner C | area YES | active YES | time YES | conflict NO | ELIGIBLE YES\n\nMost important:\n\nFor every partner who is NOT eligible, show the EXACT field/filter that\n\nexcluded them.\n\nDo not simply say \"not eligible.\"\n\n==================================================\n\n3. AREA MATCH MUST BE CHECKED\n\n==================================================\n\nAudit how the partner's working area is stored.\n\nCompare:\n\nDeepak's actual area_id\n\nwith:\n\nother partners' actual area_id.\n\nDo not compare only displayed area names.\n\nCheck for:\n\n- different area IDs\n\n- renamed areas\n\n- whitespace/case differences\n\n- zone vs area mismatch\n\n- old area records\n\n- NULL values\n\n- duplicate area records\n\n- partner area stored in another table\n\nThe marketplace must use the authoritative area relationship.\n\n==================================================\n\n4. FCM TOKEN MUST NOT CONTROL ELIGIBILITY\n\n==================================================\n\nA partner without a valid push token must STILL be eligible for the booking\n\nand MUST receive the offer in:\n\nAvailable Work\n\nPush delivery is separate from marketplace eligibility.\n\nDo NOT filter partners out because:\n\n- token missing\n\n- app closed\n\n- partner logged out\n\n- notification permission denied\n\nIf eligible, the offer must exist.\n\n==================================================\n\n5. CHECK SERVICE/TIME/DAY FILTERS\n\n==================================================\n\nCompare Deepak with partners who are missing.\n\nAudit:\n\nservice type\n\nworking days\n\nMonday rule\n\nstart time\n\nend time\n\ncustomer service time\n\ntimezone\n\navailability status\n\nDo not accidentally exclude partners because of UTC/local date mismatch.\n\n==================================================\n\n6. CHECK ACTIVE ASSIGNMENT FILTER\n\n==================================================\n\nAudit whether partners are incorrectly excluded because they have:\n\n- any old assignment\n\n- completed assignment\n\n- inactive assignment\n\n- previous assignment\n\n- assignment in another area\n\nOnly a genuinely conflicting ACTIVE assignment should exclude a partner,\n\nif that is the existing business rule.\n\n==================================================\n\n7. CHECK DECLINE SUPPRESSION\n\n==================================================\n\nIf a partner declined this lead:\n\nonly THAT partner should be temporarily suppressed.\n\nVerify:\n\npartner_id\n\ndecline time\n\nsuppression expiry\n\nA decline by Deepak or another partner must NEVER suppress other partners.\n\n==================================================\n\n8. CHECK THE RPC\n\n==================================================\n\nAudit the actual SQL/RPC used to calculate eligible partners, especially:\n\nmp_reconcile_all_partners_for_broadcast\n\nRun it against the REAL failing booking.\n\nReturn:\n\neligible_partner_ids\n\neligible_count\n\nIf the RPC returns only Deepak, the bug is in the backend/RPC eligibility\n\nlogic.\n\nFix the RPC, not the frontend.\n\n==================================================\n\n9. CHECK FOR ACCIDENTAL ONE-PARTNER LIMITS\n\n==================================================\n\nSearch the marketplace code/RPCs for:\n\nLIMIT 1\n\n.limit(1)\n\nfirst()\n\nfindFirst()\n\nsingle()\n\nmaybeSingle()\n\n[0]\n\nslice(0,1)\n\nmaxRecipients\n\nrecipientLimit\n\nroundSize\n\nThere must be no accidental one-partner restriction.\n\n==================================================\n\n10. REQUIRED RESULT FROM PART 1\n\n==================================================\n\nFor one real booking, I need proof of:\n\nALL eligible partners\n\n+\n\nexact reason each partner is eligible/ineligible.\n\nThe goal is:\n\nCustomer booking\n\n→ ALL eligible area partners identified\n\nDo NOT move to push debugging until this is correct.\n\nDo not declare the issue fixed just because Deepak still works.`}</span>,,old_content:
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
