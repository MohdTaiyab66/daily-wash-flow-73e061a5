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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            PARTNER OFFER BROADCAST & CUSTOMER PUSH — E2E FIX\n\nThe current notification system is still incorrect. Fix the entire flow end-to-end. Do not make visual changes. Focus on backend assignment logic, recipient targeting, repeat notifications, FCM delivery, and real-device behavior.\n\n1. Broadcast new service offers to ALL eligible partners simultaneously\n\nWhen a customer books a Daily Shine service:\n\n Find all active partners eligible for that customer's service area.\n\n Every eligible partner must receive the assignment at the same time.\n\n This must work for:\n\n App open/foreground\n\n App background\n\n App killed, where supported by native push delivery\n\n Each eligible partner must receive:\n\n A real system push notification\n\n The assignment in the Partner app's Available Work/assignment feed\n\n Do not restrict the offer to one partner or accidentally reuse a previous recipient/device token.\n\nThe test showed that only Deepak - 9000000006 received the offer while other eligible partners in the same area received nothing. Fix the recipient query and dispatch logic so this cannot happen.\n\n2. Repeat the offer to ALL eligible partners if nobody accepts\n\nIf no partner accepts the assignment:\n\n Repeat/remind all still-eligible partners, not only the partner who received the first notification.\n\n Every repeat cycle must re-query or correctly preserve the full eligible recipient set.\n\n Do not send repeat notifications only to the first recipient, previously notified partner, or one hardcoded/stale device token.\n\n Do not send duplicates to a partner who has already accepted or is no longer eligible.\n\nThe assignment must remain available to all eligible partners until one partner successfully accepts it or the offer expires.\n\n3. Prevent race conditions during acceptance\n\nWhen multiple partners receive the same offer:\n\n The first valid acceptance must atomically claim the assignment.\n\n Once claimed, immediately remove/close the offer for all other partners.\n\n Other partners must not be able to start or accept an already claimed service.\n\n Send an appropriate cancellation/update event to other devices if they currently have the offer open.\n\nUse a backend/database atomic claim mechanism. Do not rely on frontend timing.\n\n4. Customer must receive REAL push notifications for every service outcome\n\nThe customer is currently receiving only the in-app notification, but no system push notification.\n\nFix this for every service and every vehicle. The customer must receive a real FCM push notification when:\n\n A partner accepts the assignment\n\n Service starts, if this event is intended to notify the customer\n\n Service is completed\n\n Vehicle is marked unavailable\n\n Vehicle is marked as needing a wash / dirty\n\n Any other existing service notification event that should trigger a push\n\nThe backend must not consider writing an in-app notification to the database as a successful push notification.\n\nVerify the full chain:\n\nService event → backend trigger → recipient account lookup → active device tokens → correct Firebase project → FCM send → Android notification displayed\n\n5. Multi-vehicle customer logic must remain account-based\n\nA customer may own multiple vehicles but only view one selected vehicle on the home screen.\n\nTherefore:\n\n Push notification recipient = customer account, not currently selected vehicle.\n\n A service event for any vehicle belonging to that customer must trigger a push to the customer's registered device(s).\n\n Include vehicle_id, service_id, and notification type in the payload.\n\n Tapping the notification must open the correct vehicle/service details.\n\n The currently selected vehicle in the Customer app must never determine whether a notification is sent.\n\n6. Fix token registration and stale token handling\n\nAudit both Customer and Partner apps.\n\nMake sure:\n\n FCM token is generated and registered after login.\n\n Token registration works again after reinstall, logout/login, token refresh, and app updates.\n\n The correct token is linked to the correct authenticated account and app type.\n\n Customer tokens are never confused with Partner tokens.\n\n Invalid/stale tokens are handled without stopping delivery to other valid recipients.\n\n Multiple active devices for the same account can receive notifications if supported.\n\n The backend sends to every valid token, not just the first token returned by a query.\n\n7. Add backend diagnostics temporarily\n\nAdd clear server-side logs for every notification dispatch showing:\n\n Event type\n\n Service ID\n\n Vehicle ID\n\n Recipient account ID\n\n Number of eligible partners found\n\n Partner IDs selected\n\n Number of device tokens found\n\n Which app/project is being used: Customer or Partner\n\n FCM response for each token\n\n Success/failure reason\n\n Repeat cycle number\n\nDo not expose sensitive credentials or tokens in UI logs.\n\n8. Required E2E test\n\nTest this exact scenario before marking the fix complete:\n\n Create at least 3 active partner accounts eligible for the same service area.\n\n Customer books one Daily Shine service.\n\n Confirm all 3 partners receive:\n\n System push notification\n\n In-app assignment\n\n Nobody accepts.\n\n Wait for the repeat cycle.\n\n Confirm all still-eligible partners receive the repeat notification.\n\n Partner B accepts.\n\n Customer receives a real system push notification that a partner accepted.\n\n Confirm the assignment disappears/closes for Partners A and C.\n\n Partner B completes the service.\n\n Confirm the customer receives a real Android push notification, not only an in-app notification.\n\n Repeat the test with a customer who owns multiple cars and ensure the notification arrives even when the affected vehicle is not currently selected on the home screen.\n\nDo not claim this is fixed based only on database records, frontend state, or in-app notifications. The final result must ensure that all eligible partners receive simultaneous and repeated offers, and customers receive actual device push notifications for service events.`}</span>,old_content:
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
