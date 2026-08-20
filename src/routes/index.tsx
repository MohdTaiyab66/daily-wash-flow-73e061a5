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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            Urban Wash — Critical Push Notification Failure: Customer Push + Partner Reminder Retry\n\nDo not make visual/UI changes. Do not claim the notification system is fixed based only on in-app notifications or successful API responses.\n\nThe current E2E behavior proves that the push notification pipeline is still partially broken.\n\nCurrent observed behavior\n\nPartner side\n\n Customer booked a service.\n\n Partner received the push notification only once.\n\n Partner intentionally did not accept the assignment to test reminder/repeat behavior.\n\n No repeated/reminder notification was received.\n\nCustomer side — critical failure\n\n Partner completed another customer's/car's service.\n\n The customer received an in-app notification.\n\n But the customer received no actual Android push notification.\n\n This appears to happen for customer service events generally.\n\nThis means:\n\nNotification creation/in-app notification works, but the actual Customer App → FCM/native Android delivery is still broken.\n\nDo not treat this as fixed until a real customer device receives the push.\n\nPART 1 — Fix Customer Push Notifications First\n\nTrace the exact flow for these events:\n\nPartner action → service outcome saved → notification record created → customer account resolved → customer device token found → correct Firebase project selected → FCM request sent → FCM response checked → Android device receives notification.\n\nThe current system is apparently stopping somewhere after the in-app notification is created.\n\nAudit separately for Customer and Partner\n\nDo not assume that because Partner push works, Customer push works.\n\nCustomer and Partner use different apps and potentially different:\n\n Firebase projects\n\ngoogle-services.json\n\n Android package names\n\n FCM credentials\n\n service accounts\n\n sender IDs\n\n notification channels\n\n token registration logic\n\nVerify the Customer App pipeline independently.\n\nSpecifically inspect the Customer App FCM tokens\n\nFor the actual test customer:\n\n Confirm a valid FCM token exists in the database.\n\n Confirm the token belongs to the correct customer account.\n\n Confirm it is not expired/stale.\n\n Confirm the token is associated with the Customer App Firebase project, not the Partner Firebase project.\n\n Confirm the server is selecting this token.\n\n Confirm the server is using the correct Firebase credentials for this token.\n\n Log the actual FCM response from Firebase.\n\n If Firebase rejects the token, log the exact error.\n\n Do not silently catch the error.\n\nAlso verify token registration on:\n\n Customer login\n\n App startup\n\n App reinstall\n\n FCM token refresh\n\nA fresh token must replace/update the old token correctly without breaking multi-device support.\n\nPART 2 — Critical: Check Multi-Project FCM Routing\n\nThe previous implementation claimed:\n\n“Multi-Project FCM Routing” is working.\n\nThe actual test suggests that this may still be broken for the Customer App.\n\nAudit the routing logic carefully.\n\nFor every push:\n\nPartner recipient\n\nUse:\n\n Partner token\n\n Partner Firebase project/service account\n\nCustomer recipient\n\nUse:\n\n Customer token\n\n Customer Firebase project/service account\n\nDo not select Firebase credentials based only on event type.\n\nSelect the correct Firebase project based on the recipient app/token type.\n\nExample:\n\nCustomer receives service_completed\n\n→ Find customer account\n\n→ Find customer device token\n\n→ Identify token as CUSTOMER_APP\n\n→ Use CUSTOMER Firebase credentials\n\n→ Send push\n\nAnd:\n\nPartner receives new_assignment\n\n→ Find partner account\n\n→ Find partner device token\n\n→ Identify token as PARTNER_APP\n\n→ Use PARTNER Firebase credentials\n\n→ Send push\n\nAdd an explicit app_type / platform_app field to device token records if the current architecture cannot reliably distinguish them.\n\nPossible values:\n\ncustomer\n\npartner\n\nNever attempt to send a Customer App token using Partner Firebase credentials, or vice versa.\n\nPART 3 — Separate In-App Notification from Push Delivery\n\nCurrently, it appears that:\n\n Notification row is successfully created.\n\n Customer sees it inside the app.\n\n Push delivery fails.\n\nThese must be treated as two independent steps.\n\nRequired architecture:\n\nBusiness event\n\n     ↓\n\nCreate notification record\n\n     ↓\n\nResolve recipient account\n\n     ↓\n\nFetch ALL active device tokens\n\n     ↓\n\nFor each token:\n\n    identify app_type\n\n    select correct FCM credentials\n\n    send FCM push\n\n    record provider response\n\nA successful database notification insert must not be considered successful push delivery.\n\nAdd logging/status for:\n\nnotification_created\n\ntoken_found\n\npush_attempted\n\npush_sent\n\npush_failed\n\n actual FCM error response\n\nPART 4 — Fix Partner Assignment Reminder / Repetition\n\nThe partner currently receives a new assignment push only once.\n\nIf the assignment remains unaccepted, the partner should receive reminder notifications.\n\nRequired behavior\n\nWhen a new service assignment is sent:\n\nImmediately\n\nSend:\n\nNew Service Assignment\nYou have a new service assignment. Tap to review.\n\nIf the assignment is still:\n\n unaccepted\n\n active\n\n assigned to the same partner\n\n not expired\n\n not cancelled\n\nthen send reminder notifications.\n\nReminder behavior\n\nImplement server-side scheduled reminder logic.\n\nExample:\n\nInitial notification: immediately\n\nReminder 1: after an appropriate pending period if still unaccepted\n\nReminder 2: later if still unaccepted\n\nDo not send duplicate reminders once:\n\n Partner accepts.\n\n Assignment is reassigned.\n\n Assignment is cancelled.\n\n Assignment expires.\n\n Service is completed.\n\nThe reminder must be triggered from authoritative backend state, not only from the Partner App being open.\n\nImportant: Prevent Duplicate Reminder Jobs\n\nEnsure only one reminder chain exists per assignment.\n\nUse assignment ID and notification/reminder tracking.\n\nExample conceptual state:\n\nassignment_id\n\ninitial_push_sent_at\n\nreminder_1_sent_at\n\nreminder_2_sent_at\n\naccepted_at\n\ncancelled_at\n\nBefore sending every reminder, re-check the assignment status in the database.\n\nIf status is no longer pending, do not send.\n\nPART 5 — Test Customer Push for Every Service Outcome\n\nUse a real Customer Android device and a real Partner Android device.\n\nTest all of these individually.\n\nTest 1 — Partner accepts\n\nPartner accepts service.\n\nExpected on customer device:\n\nService Accepted\nYour Urban Wash partner has accepted your service.\n\nMust appear as an actual Android push notification, not only inside the app.\n\nTest 2 — Service started\n\nPartner starts service.\n\nExpected:\n\nService Started\nYour Urban Wash partner has started servicing your vehicle.\n\nTest 3 — Service completed\n\nPartner completes the service.\n\nExpected:\n\nService Completed ✓\nYour vehicle service has been completed successfully.\n\nThis is the critical event currently failing.\n\nTest 4 — Need Wash\n\nPartner marks the vehicle as dirty / Need Wash.\n\nExpected:\n\nVehicle Requires a Wash\nYour vehicle is dirty and requires a wash.\n\nTest 5 — Unavailable\n\nPartner marks vehicle unavailable.\n\nExpected:\n\nVehicle Unavailable\nWe were unable to perform today's service because your vehicle was unavailable.\n\nPART 6 — Multi-Vehicle Test Again\n\nUse one customer account with at least two vehicles.\n\nExample:\n\n Vehicle A is currently selected in Customer App.\n\n Vehicle B receives a service event.\n\nPartner completes Vehicle B.\n\nExpected:\n\n Customer receives actual Android push.\n\n Notification clearly identifies Vehicle B.\n\n It must arrive even though Vehicle A is selected.\n\n Tapping the notification opens the correct Vehicle B/service details.\n\nThe currently selected vehicle must have zero effect on push delivery.\n\nRecipient lookup must remain:\n\nvehicle_id\n\n→ vehicle owner customer_id\n\n→ all active customer device tokens\n\n→ send push\n\nPART 7 — Required Logging During E2E Test\n\nFor one real failing service_completed event, provide internal verification of this chain:\n\n[EVENT] service_completed received\n\n[NOTIFICATION] customer notification created\n\n[RECIPIENT] customer_id resolved\n\n[TOKEN] customer token(s) found\n\n[APP_TYPE] customer\n\n[FCM_PROJECT] customer project selected\n\n[PUSH] sending to token\n\n[FCM_RESPONSE] success/failure + actual response\n\nIf the push fails, identify the exact failing step.\n\nDo not use generic messages such as:\n\n “Push dispatched”\n\n “Notification sent”\n\n “Pipeline restored”\n\nunless the actual FCM provider response confirms delivery acceptance.\n\nFinal Acceptance Criteria\n\nThis task is NOT complete if:\n\n An in-app notification appears but no push appears.\n\n The server returns success without checking FCM response.\n\n Only Partner notifications work.\n\n Customer notifications work only for the currently selected vehicle.\n\n A pending assignment receives only the initial notification and no reminders.\n\nThe task is complete only after this real E2E test passes:\n\nCustomer books service\n\n→ Partner receives initial push.\n\nPartner does not accept\n\n→ Partner receives reminder push(es) while assignment remains pending.\n\nPartner accepts\n\n→ Customer receives actual Android push.\n\nPartner starts\n\n→ Customer receives actual Android push.\n\nPartner completes\n\n→ Customer receives actual Android push.\n\nRepeat using another vehicle under the same customer account while a different vehicle is selected\n\n→ Customer still receives the push.\n\nDo not mark the issue resolved until the actual physical Customer Android device receives the service-completed push notification.`}</span>,old_content:
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
