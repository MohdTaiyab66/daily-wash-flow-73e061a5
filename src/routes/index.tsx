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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 — FINAL FIX: ASSIGN PARTNER RPC STILL REFERENCES NONEXISTENT TABLE\n\nDO NOT change the UI.\n\nThe Admin booking page now loads correctly.\n\nREAL CURRENT ERROR WHEN CLICKING \"ASSIGN PARTNER\":\n\nrelation \"public.partner_profiles\" does not exist\n\nThis proves the remaining failure is in the BACKEND ASSIGNMENT OPERATION,\n\nnot booking resolution and not the partner list UI.\n\n==================================================\n\n1. FIND THE EXACT OFFENDING SQL\n\n==================================================\n\nSearch the ENTIRE database definition and application code for:\n\npublic.partner_profiles\n\npartner_profiles\n\nSearch in:\n\n- admin_assign_partner_to_booking\n\n- assignPartnerToBooking\n\n- every SQL function called by admin_assign_partner_to_booking\n\n- triggers fired by assignment\n\n- views\n\n- policies\n\n- helper functions\n\n- notification functions\n\n- audit functions\n\n- server functions\n\n- edge/server functions\n\nDo NOT assume the error is coming from the React page.\n\nI want the EXACT function/query that references:\n\npublic.partner_profiles\n\n==================================================\n\n2. INSPECT THE CURRENT ASSIGNMENT RPC\n\n==================================================\n\nInspect the actual deployed definition of:\n\nadmin_assign_partner_to_booking\n\nShow every table it reads or writes.\n\nEspecially check whether it does something like:\n\nFROM public.partner_profiles\n\nJOIN public.partner_profiles\n\nSELECT FROM public.partner_profiles\n\nUPDATE public.partner_profiles\n\nIf ANY part of this RPC references the nonexistent table, replace it with the\n\nREAL partner source used by the existing Urban Wash Partner App.\n\nDO NOT create a fake partner_profiles table.\n\n==================================================\n\n3. FIND THE REAL PARTNER SOURCE\n\n==================================================\n\nInspect the actual database schema and identify the real authoritative source\n\nfor partner accounts.\n\nIt must provide:\n\npartner_id\n\npartner name\n\nphone\n\nactive/approved status\n\nwork area / zone\n\navailability where applicable\n\nUse the EXISTING partner data model.\n\nDo not invent a new schema.\n\n==================================================\n\n4. FIX PARTNER AREA MATCHING TOO\n\n==================================================\n\nThe Admin page currently shows many partners as:\n\n\"No area\"\n\nThis also needs to be fixed.\n\nFor the current booking:\n\nAREA:\n\nKalyanpur (West)\n\nAdmin should show the actual partners whose assigned work area/zone is\n\nKalyanpur (West).\n\nDo not use \"No area\" when the lookup simply failed.\n\nDistinguish:\n\nreal area = show area\n\narea genuinely missing = \"Area not assigned\"\n\ndatabase query failure = SHOW THE REAL ERROR\n\nThe same authoritative area source used by Partner App assignment logic must\n\nbe used here.\n\n==================================================\n\n5. FIX THE ASSIGNMENT OPERATION\n\n==================================================\n\nAfter selecting a valid partner, clicking:\n\nASSIGN PARTNER\n\nmust execute successfully.\n\nThe operation must atomically:\n\n1. Verify booking exists\n\n2. Verify booking is paid\n\n3. Verify booking is still unassigned\n\n4. Verify partner exists\n\n5. Verify partner is eligible for this area\n\n6. Create assignment\n\n7. Update booking.assigned_partner_id\n\n8. Update booking/assignment status\n\n9. Create partner notification\n\n10. Create customer notification\n\n11. Create admin audit event\n\nIf notification delivery fails, the assignment itself must STILL succeed.\n\nPush notifications must never cause the database assignment to roll back.\n\n==================================================\n\n6. CHECK ALL CALLED FUNCTIONS\n\n==================================================\n\nDo not only inspect admin_assign_partner_to_booking.\n\nTrace the COMPLETE call chain:\n\nAdmin button\n\n→ assignPartnerToBooking\n\n→ admin_assign_partner_to_booking\n\n→ helper SQL functions\n\n→ triggers\n\n→ notification creation\n\n→ audit logging\n\nFind every place where partner_profiles is referenced.\n\nRemove/fix ALL invalid references.\n\n==================================================\n\n7. USE A TESTABLE TRANSACTION\n\n==================================================\n\nThe assignment should behave like:\n\nBEGIN\n\nvalidate booking\n\nvalidate partner\n\ncreate assignment\n\nupdate booking\n\ncreate notification rows\n\ncreate audit row\n\nCOMMIT\n\nIf push sending fails:\n\nDO NOT ROLLBACK THE ASSIGNMENT.\n\nThe database assignment must remain successful.\n\n==================================================\n\n8. DO NOT REINTRODUCE MARKETPLACE\n\n==================================================\n\nThis Admin manual assignment flow must remain independent of:\n\n- marketplace offers\n\n- broadcast\n\n- first-partner-wins\n\n- FCM token availability\n\n- partner online status\n\nThe Admin can assign a paid Daily Shine booking even if no partner received\n\nthe original push.\n\n==================================================\n\n9. REAL E2E TEST WITH CURRENT BOOKING\n\n==================================================\n\nUse the currently open paid booking:\n\nBooking:\n\n5c4ecb85-c6cb-4c14-b09c-8fa454a0e270\n\nTest:\n\n1. Booking loads\n\n2. Partner list loads\n\n3. Correct Kalyanpur partners appear\n\n4. Select one valid partner\n\n5. Click ASSIGN PARTNER\n\n6. No partner_profiles error\n\n7. Assignment succeeds\n\n8. booking.assigned_partner_id = selected partner\n\n9. assignment record exists\n\n10. Partner receives/has assignment\n\n11. Customer receives Partner Assigned notification\n\n12. Admin sees ASSIGNED state\n\n==================================================\n\n10. REQUIRED FORENSIC RESULT\n\n==================================================\n\nDo NOT reply \"fixed\" without showing the actual root cause.\n\nReturn:\n\nOFFENDING FUNCTION:\n\n____\n\nOFFENDING SQL:\n\n____\n\nOLD INVALID TABLE:\n\npublic.partner_profiles\n\nREAL PARTNER TABLE/VIEW:\n\n____\n\nREAL PARTNER AREA SOURCE:\n\n____\n\nRPC FIXED:\n\n____\n\nTRIGGERS CHECKED:\n\n____\n\nHELPER FUNCTIONS CHECKED:\n\n____\n\nCURRENT BOOKING ID:\n\n5c4ecb85-c6cb-4c14-b09c-8fa454a0e270\n\nSELECTED PARTNER ID:\n\n____\n\nASSIGNMENT CREATED:\n\nYES/NO\n\nBOOKING UPDATED:\n\nYES/NO\n\nPARTNER NOTIFICATION:\n\nYES/NO\n\nCUSTOMER NOTIFICATION:\n\nYES/NO\n\nCOMMIT SHA:\n\n____\n\nIMPORTANT:\n\nDo not create another UI fallback.\n\nDo not create public.partner_profiles just to make the error disappear.\n\nFind the exact deployed SQL that is calling public.partner_profiles and\n\nreplace it with the real existing partner schema.\n\nThe final acceptance condition is:\n\nPAID BOOKING\n\n→ ADMIN SELECTS PARTNER\n\n→ ASSIGN PARTNER SUCCESS\n\n→ DATABASE ASSIGNMENT CREATED\n\n→ NO partner_profiles ERROR`;

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
