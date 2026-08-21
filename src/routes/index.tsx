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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 REAL-DEVICE VERIFICATION — DO NOT MODIFY CODE UNLESS TEST FAILS\n\nThe latest implementation claims:\n\nAdmin assignment\n\n→ partner_notifications row\n\n→ Supabase realtime\n\n→ Partner App global listener\n\n→ Home fallback listener\n\n→ assignment/route query invalidation\n\nRun ONE completely fresh Daily Shine booking and test with:\n\nDEVICE A = Admin Console\n\nDEVICE B = assigned Partner Android App\n\n==================================================\n\nSTEP 1 — CREATE BOOKING\n\n==================================================\n\nCustomer creates a NEW Daily Shine booking.\n\nRecord:\n\nbooking_id\n\nservice_id\n\ncustomer_id\n\nvehicle_id\n\nConfirm payment is successful.\n\n==================================================\n\nSTEP 2 — ADMIN ASSIGNS PARTNER\n\n==================================================\n\nAdmin receives the booking.\n\nAdmin opens the exact booking.\n\nAdmin selects ONE eligible partner.\n\nClick:\n\nASSIGN PARTNER\n\nRecord:\n\nassignment_id\n\npartner_id\n\nConfirm the assignment row is committed successfully.\n\n==================================================\n\nSTEP 3 — VERIFY partner_notifications\n\n==================================================\n\nImmediately after assignment, verify a new row exists for the assigned partner.\n\nConfirm:\n\npartner_id\n\ncategory = assignments\n\nmetadata.booking_id\n\nmetadata.service_id\n\nmetadata.assignment_id\n\nmetadata.vehicle_id\n\nmetadata.partner_id\n\nAll IDs must match the actual assignment.\n\n==================================================\n\nSTEP 4 — VERIFY REALTIME CONNECTION\n\n==================================================\n\nOn the REAL Partner Android App, capture:\n\n[PARTNER-REALTIME] listener mounted\n\n[PARTNER-REALTIME] subscription status\n\n[PARTNER-REALTIME] event received\n\n[PARTNER-REALTIME] event payload\n\n[PARTNER-REALTIME] invalidation triggered\n\nDo not rely on source-code inspection.\n\nWe need runtime evidence from the actual Partner device.\n\n==================================================\n\nSTEP 5 — VERIFY PARTNER APP WITHOUT REFRESH\n\n==================================================\n\nAfter Admin clicks ASSIGN PARTNER:\n\nDO NOT reload the Partner App.\n\nDO NOT force-close/reopen.\n\nDO NOT manually navigate away and back.\n\nWithin a few seconds, verify:\n\nHOME:\n\nassignment appears\n\nAVAILABLE:\n\nassignment appears\n\nDAILY ROUTE:\n\ncustomer appears\n\nNOTIFICATIONS:\n\nnew assignment appears\n\n==================================================\n\nSTEP 6 — VERIFY ROUTE DATA\n\n==================================================\n\nThe assigned customer must show:\n\ncustomer name\n\nvehicle\n\nvehicle number\n\nservice time\n\narea/location\n\nThe Daily Route map must show the customer location.\n\n==================================================\n\nSTEP 7 — VERIFY QUERY REFRESH\n\n==================================================\n\nShow which exact query keys were invalidated.\n\nAt minimum inspect the actual keys used for:\n\npartner assignment\n\ntoday assignment\n\nhome\n\navailable\n\ndaily route\n\nnotifications\n\nearnings\n\nConfirm the invalidation actually causes a database refetch.\n\nDo not report only \"invalidate() was called.\"\n\nVerify that the refetched query actually contains the NEW assignment.\n\n==================================================\n\nSTEP 8 — VERIFY PARTNER ID\n\n==================================================\n\nCompare:\n\nassignment.partner_id\n\npartner_notifications.partner_id\n\nrealtime event partner_id\n\nlogged-in Partner App partner ID\n\nAll four MUST match.\n\nIf they do not match, identify the identity mapping problem.\n\n==================================================\n\nSTEP 9 — TEST WITH FCM FAILURE\n\n==================================================\n\nTemporarily assume/force Partner FCM delivery failure.\n\nThe Partner App must STILL update from:\n\ndatabase\n\n+\n\nrealtime\n\nPush notification is not the source of truth.\n\n==================================================\n\nSTEP 10 — CUSTOMER\n\n==================================================\n\nVerify Customer still receives:\n\n\"Partner X has been assigned\"\n\nwith the correct:\n\npartner\n\nvehicle\n\nservice\n\n==================================================\n\nFINAL REQUIRED REPORT\n\n==================================================\n\nReturn actual values:\n\nbooking_id:\n\nservice_id:\n\nassignment_id:\n\npartner_id:\n\nvehicle_id:\n\npartner_notifications row = PASS/FAIL\n\nRealtime listener mounted = PASS/FAIL\n\nRealtime subscription connected = PASS/FAIL\n\nRealtime assignment event emitted = PASS/FAIL\n\nRealtime event received on real Partner device = PASS/FAIL\n\npartner_id match = PASS/FAIL\n\nPartner query refetch = PASS/FAIL\n\nHome updated = PASS/FAIL\n\nAvailable updated = PASS/FAIL\n\nDaily Route updated = PASS/FAIL\n\nMap updated = PASS/FAIL\n\nPartner notification updated = PASS/FAIL\n\nEarnings updated = PASS/FAIL\n\nCustomer assigned notification = PASS/FAIL\n\nPartner FCM = PASS/FAIL\n\nMOST IMPORTANT:\n\nIf the Partner App still shows nothing, provide the FIRST failing point:\n\n1. notification row not created\n\n2. realtime event not emitted\n\n3. realtime subscription not connected\n\n4. event not received\n\n5. partner_id mismatch\n\n6. query invalidation not fired\n\n7. query refetched but returned no assignment\n\n8. UI failed to render returned assignment\n\nDo not make another broad fix until the first failing point is identified.`;

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