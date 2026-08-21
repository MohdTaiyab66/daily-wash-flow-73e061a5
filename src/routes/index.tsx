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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 PARTNER PARITY FORENSIC FIX — PART 1\n\nDO NOT MAKE UI CHANGES YET.\n\nREAL PROBLEM:\n\nDeepak\n\n9000000006\n\nworks correctly when Admin assigns him:\n\n✓ receives assignment\n\n✓ push notification works\n\n✓ in-app notification works\n\n✓ Home updates\n\n✓ Daily Route updates\n\n✓ assignment appears correctly\n\nOther partners receiving the SAME type of Admin assignment do not update.\n\nWe need to find EXACTLY why Deepak works while other partners fail.\n\n==================================================\n\n1. COMPARE REAL PARTNERS\n\n==================================================\n\nCompare:\n\nDeepak 9000000006\n\nagainst at least 3 failing partners.\n\nFor each compare:\n\npartner_id\n\nauth_user_id\n\nrole\n\naccount status\n\napproval status\n\nhome_area\n\nzone\n\nworking areas\n\nworking days\n\nworking hours\n\nactive assignments\n\nnotification settings\n\nFCM token count\n\nvalid FCM token count\n\napp_type\n\ndevice/platform\n\ntoken updated_at\n\npartner notification records\n\nassignment records\n\nCreate an internal comparison:\n\nFIELD | DEEPAK | PARTNER A | PARTNER B | PARTNER C\n\nDo not change anything until the actual difference is identified.\n\n==================================================\n\n2. PARTNER IDENTITY\n\n==================================================\n\nCompare these for Deepak and failing partners:\n\npartners.id\n\nauth.users.id\n\nuser_roles.user_id\n\nassignment.partner_id\n\npartner_notifications.partner_id\n\nPartner App current logged-in partner ID\n\nDetermine the CANONICAL partner identity.\n\nThe same identity mapping must work for every partner.\n\nDo NOT create Deepak-specific logic.\n\n==================================================\n\n3. PARTNER STATUS\n\n==================================================\n\nCompare:\n\nactive\n\napproved\n\npending_verification\n\nblocked\n\nsuspended\n\nDetermine whether failing partners are being incorrectly excluded because of\n\na status filter that Deepak passes.\n\nIf the status is legitimately required, enforce it consistently.\n\n==================================================\n\n4. AREA / WORKING AREA\n\n==================================================\n\nCompare:\n\nDeepak.home_area\n\nagainst failing partners.\n\nAlso inspect:\n\nzone\n\nworking_area\n\npartner_area\n\nselected_area\n\nUse the SAME authoritative area source for all partners.\n\nDo not hardcode or special-case Deepak.\n\n==================================================\n\n5. FCM TOKEN PARITY\n\n==================================================\n\nCompare Deepak vs failing partners:\n\nvalid token count\n\nactive token\n\napp_type = partner\n\nFirebase project\n\ntoken updated_at\n\nIf a failing partner has no valid token, fix token registration/recovery in\n\nthe Partner APK.\n\nBUT:\n\nFCM token availability must NEVER determine assignment eligibility.\n\nA partner without push must still receive the assignment in-app.\n\n==================================================\n\n6. PARTNER NOTIFICATION RECORD\n\n==================================================\n\nWhen Admin assigns Deepak, inspect the created:\n\npartner_notifications\n\nrow.\n\nThen inspect the same for a failing partner.\n\nCompare:\n\npartner_id\n\ncategory\n\ntitle\n\nbody\n\nbooking_id\n\nservice_id\n\nassignment_id\n\nvehicle_id\n\nmetadata\n\ncreated_at\n\nIf Deepak receives a notification row but another partner does not:\n\nthe recipient-resolution/notification creation logic is wrong.\n\nFix the backend.\n\n==================================================\n\n7. ASSIGNMENT RECORD\n\n==================================================\n\nCompare Deepak and failing partners after Admin assignment.\n\nVerify:\n\nassignment_id\n\nbooking_id\n\nservice_id\n\npartner_id\n\ncustomer_id\n\nvehicle_id\n\nstatus\n\nThe records must be structurally identical except for IDs/data.\n\n==================================================\n\n8. RLS / AUTHORIZATION\n\n==================================================\n\nTest the same assignment query using:\n\nDeepak's authenticated Partner session\n\nand:\n\nFailing Partner's authenticated Partner session.\n\nIf Deepak can see his assignment but another valid partner cannot:\n\nfind the exact RLS/policy difference.\n\nFix RLS so every legitimate partner can see ONLY their own assignments.\n\nDo not expose other partners' assignments.\n\n==================================================\n\n9. REAL E2E COMPARISON\n\n==================================================\n\nRun:\n\nTEST A:\n\nAdmin assigns Deepak.\n\nTEST B:\n\nAdmin assigns Partner A.\n\nFor both, record:\n\ndatabase assignment\n\npartner notification row\n\nFCM token\n\nrealtime event\n\nPartner query result\n\nCompare every step.\n\n==================================================\n\n10. REQUIRED RESULT\n\n==================================================\n\nDo NOT say \"fixed\".\n\nTell me:\n\nWHAT EXACT DIFFERENCE makes Deepak work?\n\nWHAT EXACT DIFFERENCE makes Partner A/B/C fail?\n\nWhich database field, filter, RLS policy, token mapping, or identity mapping\n\ncauses the difference?\n\nThen fix the underlying common logic so ALL partners use the SAME path.\n\nDo not manually modify failing partner rows just to make them work.\n\nPART 1 is complete only after the exact root cause is identified.`;

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