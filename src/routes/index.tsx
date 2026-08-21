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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n\nFINAL E2E VALIDATION — DO NOT MODIFY CODE UNLESS A TEST FAILS\n\nThe Admin Controlled Daily Shine flow is now claimed to be complete.\n\nDo a REAL end-to-end validation using fresh data and real devices.\n\nFLOW TO TEST:\n\nCUSTOMER\n\n→ books Daily Shine\n\n→ payment succeeds\n\nADMIN\n\n→ receives NEW PAID BOOKING\n\n→ sound plays\n\n→ unread count increases\n\n→ Open goes to EXACT booking\n\n→ booking shows UNASSIGNED\n\nADMIN\n\n→ selects eligible Partner X\n\n→ Assign Partner\n\nPARTNER\n\n→ receives real Android push\n\n→ assignment appears in Partner App\n\nCUSTOMER\n\n→ receives real Android push:\n\n  "Partner X has been assigned"\n\n→ correct vehicle/service is shown\n\nPARTNER\n\n→ starts service\n\n→ completes service\n\nCUSTOMER\n\n→ receives real Android completion push\n\nADMIN\n\n→ sees service completed\n\nPARTNER\n\n→ earnings/progress update\n\nCUSTOMER\n\n→ service history/entitlement update\n\n==================================================\n\nVERIFY THESE WITH ACTUAL VALUES:\n\nbooking_id\n\nservice_id\n\nassignment_id\n\ncustomer_id\n\nvehicle_id\n\npartner_id\n\nAdmin:\n\nnotification created = YES\n\nsound = PASS/FAIL\n\nOpen route = PASS/FAIL\n\nbooking status = PAID/UNASSIGNED before assignment\n\nAssignment:\n\nadmin_assign_partner_to_booking = SUCCESS\n\nassigned_partner_id = correct partner\n\nPartner:\n\nnotification record = YES\n\nvalid token count = N\n\nFCM response = SUCCESS/FAIL\n\nphysical Android push = RECEIVED/NOT RECEIVED\n\nassignment visible in app = YES/NO\n\nCustomer:\n\nnotification record = YES\n\nvalid token count = N\n\nFCM response = SUCCESS/FAIL\n\nphysical Android push = RECEIVED/NOT RECEIVED\n\ncorrect vehicle opened = YES/NO\n\nCompletion:\n\nservice status = COMPLETED\n\ncustomer push = RECEIVED/NOT RECEIVED\n\nadmin status = UPDATED/NOT UPDATED\n\npartner earnings = UPDATED/NOT UPDATED\n\ncustomer entitlement/history = UPDATED/NOT UPDATED\n\n==================================================\n\nIMPORTANT:\n\nDo not consider an in-app notification proof of push delivery.\n\nDo not consider a database row proof of Android delivery.\n\nDo not use old test bookings.\n\nUse ONE fresh booking created after the latest deployment.\n\nAlso verify that the old automatic marketplace broadcast does NOT assign the\n\nbooking before Admin manually assigns a partner.\n\nFINAL REPORT MUST SHOW PASS/FAIL FOR EVERY STEP.\n\nIf any step fails, identify the exact failing layer and fix ONLY that layer.`;

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
