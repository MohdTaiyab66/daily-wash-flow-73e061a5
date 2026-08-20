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
        <span className="text-xs text-muted-foreground">{`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            Urban Wash — Critical E2E Push Notification Fix\n\nDo not make any visual/UI modifications. The entire push notification system has stopped working in both the Customer App and Partner App. It was working previously. Find what broke and restore the previous working notification pipeline instead of creating a disconnected new implementation.\n\nCurrent Critical Problem\n\nNo push notifications are being received anywhere:\n\n Customer books a service → Partner receives no notification.\n\n Partner accepts an assignment → Customer receives no notification.\n\n Partner starts service → Customer receives no notification.\n\n Service is completed → Customer receives no notification.\n\n Vehicle marked Need Wash / Dirty → Customer receives no notification.\n\n Vehicle marked Unavailable → Customer receives no notification.\n\n Any other existing notification event → no push notification.\n\nBoth Partner App and Customer App are affected.\n\nPART 1 — Full E2E Notification Audit\n\nTrace the complete pipeline for every notification:\n\nEvent occurs → backend/database trigger/function → notification creation → recipient lookup → FCM/Expo/native push provider → correct device token → device receives notification → tapping notification opens the correct app/screen.\n\nFind exactly where the pipeline is currently breaking.\n\nAudit:\n\n Current notification service/provider configuration.\n\n Firebase/FCM credentials and configuration.\n\ngoogle-services.json / Firebase initialization in both Android apps.\n\n Customer and Partner FCM token registration.\n\n Token refresh handling.\n\n Device token storage in Supabase/database.\n\n Whether old/stale tokens are being used.\n\n Whether notification server functions / Edge Functions are actually being triggered.\n\n Whether service-role permissions or environment secrets broke.\n\n Database triggers/webhooks/events.\n\n Android notification permission, especially Android 13+.\n\n Notification channels and importance.\n\n Foreground notification handling.\n\n Background/killed-app notification handling.\n\n Any recent code change that disconnected the previously working pipeline.\n\nDo not only check that a notification record exists in the database. Verify that an actual push is sent to and received on the physical device.\n\nPART 2 — MULTI-VEHICLE CUSTOMER NOTIFICATION FIX\n\nThis is mandatory.\n\nA customer may have multiple vehicles under one Urban Wash account.\n\nThe customer may currently be viewing only one selected vehicle on the Home/My Plan screen, but this must never control push notification delivery.\n\nRequired recipient logic\n\nPush notifications belong to the customer account/device, not to the currently selected vehicle.\n\nFor example:\n\nCustomer account has:\n\n Vehicle A\n\n Vehicle B\n\n Vehicle C\n\nEven if Vehicle A is currently selected in the app, the customer must still receive notifications related to Vehicle B and Vehicle C.\n\nFix the notification recipient lookup\n\nDo not use:\n\n currently selected vehicle ID\n\n active vehicle context\n\n Home screen vehicle\n\n cached selected vehicle\n\nto determine whether the customer receives a notification.\n\nInstead:\n\nService/Vehicle Event → find vehicle owner/customer account → find ALL valid active push tokens for that customer account → send notification to all registered devices/tokens.\n\nThe notification payload must still include the relevant vehicle_id, so when the customer taps it, the app can open the correct vehicle/service/history.\n\nExample:\n\nYour Tata Nexon service has been completed.\n\nThe customer receives this even if they currently had their Maruti Brezza selected when the notification was sent.\n\nRequired Events to Restore and Verify\n\nCustomer → Partner\n\n1. New service booking / assignment\n\nWhen a customer books a service and it becomes available/assigned to a partner:\n\nPartner must receive a push notification immediately.\n\nExample:\n\nNew Service Assignment\nToyota Glanza — Service scheduled before 10 AM.\n\nThe notification must contain the assignment/service ID and deep-link correctly into the assignment.\n\nPartner → Customer\n\n2. Assignment accepted\n\nWhen the partner accepts:\n\nYour service has been accepted\nYour Urban Wash partner has accepted the assignment.\n\nInclude the correct vehicle and service ID.\n\n3. Partner starts service\n\nService Started\nYour Urban Wash partner has started servicing your vehicle.\n\n4. Service completed\n\nService Completed ✓\nYour vehicle service has been completed successfully.\n\n5. Need Wash / Dirty vehicle\n\nVehicle Requires a Wash\nYour vehicle is dirty and requires a wash.\n\nDo not call this unavailable.\n\n6. Vehicle unavailable\n\nVehicle Unavailable\nWe were unable to perform today's service because your vehicle was unavailable.\n\n7. Any existing subscription/service/booking notifications\n\nRestore all notification events that existed before the recent changes.\n\nToken Architecture — Required Fix\n\nMake notification delivery account-based.\n\nCustomer\n\nOne customer account can have:\n\n multiple vehicles\n\n one or more devices\n\n multiple valid push tokens\n\nStore and manage tokens independently from the selected vehicle.\n\nPartner\n\nPartner tokens must remain associated with the authenticated partner account and active device.\n\nImplement:\n\n Register token on login/app startup.\n\n Update token if FCM rotates it.\n\n Remove or invalidate token on logout if appropriate.\n\n Support multiple devices per account where the existing architecture allows it.\n\n Never overwrite another valid token simply because another device logs in.\n\nUse a proper table/structure for device tokens if the current implementation is overwriting tokens.\n\nCritical Backend Requirements\n\nFor every notification event:\n\n Event succeeds.\n\n Notification is created/sent only after the relevant backend transaction succeeds.\n\n Recipient account is determined from the authoritative backend relationship.\n\n All valid device tokens for that account are fetched.\n\n Push is sent.\n\n Failed/invalid tokens are handled and cleaned up safely.\n\n One failed token must not prevent delivery to other valid tokens.\n\n Notification failures must be logged with the actual provider response.\n\nDo not silently catch and ignore push errors.\n\nAndroid Requirements\n\nVerify in both Customer APK and Partner APK:\n\n Notification permission requested and granted.\n\n Correct Firebase project/configuration.\n\n Correct package name/application ID.\n\n FCM initialized correctly.\n\n Correct FirebaseMessagingService.\n\n Token registration actually runs.\n\n Notification channels exist.\n\n Important assignment notifications use the correct channel and importance.\n\n Foreground notifications are displayed.\n\n Background notifications are displayed.\n\n Killed-app notifications are displayed.\n\n Notification tapping opens the correct destination.\n\nDo not assume that the web/PWA notification implementation is enough. Verify the native Android notification pipeline separately.\n\nImportant: Restore Existing Working Logic\n\nNotifications were working before.\n\nFirst compare the current implementation with the previous working notification architecture and identify what changed or was disconnected.\n\nDo not create duplicate notification systems. Repair and reconnect the existing pipeline wherever possible.\n\nRequired E2E Test Matrix\n\nTest with real Customer and Partner accounts and actual Android devices.\n\nTest 1\n\nCustomer books Vehicle A → Partner receives push.\n\nTest 2\n\nPartner accepts Vehicle A → Customer receives push.\n\nTest 3\n\nPartner starts Vehicle A → Customer receives push.\n\nTest 4\n\nPartner completes Vehicle A → Customer receives push.\n\nTest 5\n\nPartner marks Vehicle A as Need Wash → Customer receives the correct “Vehicle requires a wash” push.\n\nTest 6\n\nPartner marks Vehicle A as Unavailable → Customer receives unavailable notification.\n\nTest 7 — Multi-vehicle critical test\n\nOne customer has:\n\n Vehicle A selected in app.\n\n Vehicle B is serviced.\n\nPartner completes/updates Vehicle B.\n\nThe customer must still receive the push notification even though Vehicle A is currently selected.\n\nTap the notification → correct Vehicle B/service details should open.\n\nTest 8\n\nClose/kill both apps → trigger notification → device still receives it.\n\nTest 9\n\nKeep app open in foreground → trigger notification → notification is visibly handled.\n\n\nDo not mark this fixed merely because notification rows are created in Supabase or because the API returns success.\n\nThe fix is complete only when the full chain is verified:\n\nCustomer/Partner action → backend event → correct recipient account → valid device token → FCM push → physical Android device receives notification → tapping opens the correct relevant screen.\n\nAlso ensure all vehicles belonging to a customer account can generate notifications to that customer's device regardless of which vehicle is currently selected in the app.`}</span>,old_content:
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
