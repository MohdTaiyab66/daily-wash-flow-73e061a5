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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 — FIX PARTNER FCM TOKEN REGISTRATION / RECOVERY\n\nThe latest forensic audit shows:\n\n- 33 eligible partner offers are being created correctly.\n\n- marketplace_offers is working.\n\n- Only 2 partners currently have valid push tokens.\n\n- Many partner tokens are invalidated by FCM with UNREGISTERED.\n\n- Deepak (9000000006) has 13 recorded tokens, all invalidated.\n\nTherefore the remaining problem is the Partner Android FCM token lifecycle.\n\nDO NOT change marketplace eligibility or offer generation unless the token\n\naudit proves a problem there.\n\nFIX THE PARTNER PUSH TOKEN PIPELINE E2E.\n\n==================================================\n\n1. TOKEN REGISTRATION\n\n==================================================\n\nFor every Partner APK:\n\nOn app startup/login:\n\nFirebase Messaging must initialize.\n\nObtain the current FCM token.\n\nImmediately register/update it in the backend with:\n\npartner_id\n\nfcm_token\n\napp_type = partner\n\nplatform = android\n\ndevice_id if available\n\nactive = true\n\nupdated_at\n\nDo not require the partner to manually open a notification page.\n\n==================================================\n\n2. TOKEN REFRESH\n\n==================================================\n\nImplement/verify onNewToken handling.\n\nWhenever Firebase rotates the token:\n\nold token → inactive\n\nnew token → active\n\nThe new token must be persisted immediately.\n\n==================================================\n\n3. REINSTALL / LOGIN RECOVERY\n\n==================================================\n\nTest:\n\nuninstall Partner APK\n\n→ install latest APK\n\n→ login\n\n→ token generated\n\n→ token stored\n\nAlso test:\n\nlogout\n\n→ login again\n\nand:\n\napp update\n\n→ token refresh\n\nEvery time, the current valid token must be registered.\n\n==================================================\n\n4. INVALID TOKEN HANDLING\n\n==================================================\n\nIf FCM returns:\n\nUNREGISTERED\n\nremove/deactivate that token.\n\nBUT immediately ensure the device registers a fresh token.\n\nDo not leave the partner account with:\n\n0 valid tokens\n\nafter a new valid device token exists.\n\n==================================================\n\n5. DO NOT USE TOKEN AS ELIGIBILITY\n\n==================================================\n\nA partner with no valid push token must STILL have:\n\nmarketplace offer\n\nAvailable Work entry\n\nlogin recovery\n\nPush delivery is separate from marketplace eligibility.\n\n==================================================\n\n6. CUSTOMER APP\n\n==================================================\n\nApply the same token lifecycle to Customer APK.\n\nCustomer must have:\n\nvalid FCM token\n\napp_type = customer\n\nactive = true\n\nand token refresh handling.\n\n==================================================\n\n7. MULTI-DEVICE\n\n==================================================\n\nDo not overwrite every token with one row if the architecture supports\n\nmultiple devices.\n\nFor each account:\n\nALL active valid tokens should receive the push.\n\nOne invalid token must not prevent delivery to another valid token.\n\n==================================================\n\n8. REAL DEVICE DIAGNOSTICS\n\n==================================================\n\nFor one real Partner device, log:\n\npartner_id\n\nFirebase token obtained\n\ntoken registration result\n\ntoken active status\n\nFCM project\n\npackage/application ID\n\nThen create a real booking.\n\nExpected:\n\neligible partner = YES\n\noffer exists = YES\n\nvalid token = YES\n\nFCM send = SUCCESS\n\nAndroid push = RECEIVED\n\n==================================================\n\n9. CRITICAL DEEPAK TEST\n\n==================================================\n\nUse Deepak 9000000006.\n\nBefore booking:\n\nverify valid_token_count.\n\nIf zero:\n\nopen latest Partner APK\n\nlogin\n\nforce token registration\n\nverify valid_token_count becomes >= 1.\n\nThen create a new booking in Deepak's area.\n\nExpected:\n\nDeepak receives actual Android push.\n\nThen repeat with 2 other eligible partners.\n\nALL THREE must have:\n\nvalid token\n\noffer\n\npush\n\n==================================================\n\n10. CUSTOMER PUSH\n\n==================================================\n\nPerform the same token audit for the Customer APK.\n\nFor a completed service:\n\ncustomer token\n\n→ Customer Firebase project\n\n→ FCM accepted\n\n→ Android push received\n\nDo not accept \"in-app notification received\" as push success.\n\n==================================================\n\nFINAL ACCEPTANCE\n\nDo not say this is fixed until:\n\n[ ] Partner fresh install creates valid FCM token\n\n[ ] Partner login refreshes/repairs token\n\n[ ] FCM UNREGISTERED tokens are replaced\n\n[ ] 3+ partner devices have valid active tokens\n\n[ ] Same booking produces offers for all\n\n[ ] Same booking sends push to all 3+\n\n[ ] Deepak receives push again\n\n[ ] Customer has valid token\n\n[ ] Customer receives actual Android push\n\n[ ] Multi-vehicle customer push still works\n\nMOST IMPORTANT:\n\nThe marketplace is now proven to create offers for all 33 partners.\n\nTherefore stop changing marketplace fan-out.\n\nFix the device-token lifecycle and prove:\n\nTOKEN REGISTERED\n\n→ FCM SEND SUCCESS\n\n→ ACTUAL DEVICE PUSH`}</span>,,old_content:
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
