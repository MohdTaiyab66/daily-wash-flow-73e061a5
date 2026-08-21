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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — ADMIN CONTROLLED DAILY SHINE ASSIGNMENT FLOW\n\nDo not make unrelated UI changes. Fix this E2E workflow only.\n\nCURRENT PROBLEM:\n\nCustomer books Daily Shine, but automatic partner notification/broadcast is\n\nunreliable.\n\nNEW REQUIRED FLOW:\n\nCUSTOMER BOOKS\n\n↓\n\nADMIN RECEIVES NEW BOOKING ALERT\n\n↓\n\nADMIN SELECTS ELIGIBLE AREA PARTNER\n\n↓\n\nPARTNER IS ASSIGNED\n\n↓\n\nPARTNER RECEIVES ASSIGNMENT\n\n↓\n\nCUSTOMER RECEIVES \"PARTNER ASSIGNED\" NOTIFICATION\n\n↓\n\nALL THREE SYSTEMS UPDATE FROM THE SAME ASSIGNMENT RECORD\n\n==================================================\n\n1. CUSTOMER BOOKING\n\n==================================================\n\nAfter successful payment for Daily Shine:\n\nCreate one authoritative booking.\n\nStatus:\n\nPAID / UNASSIGNED\n\nDo NOT automatically assign a partner.\n\n==================================================\n\n2. ADMIN NOTIFICATION\n\n==================================================\n\nImmediately notify Admin Console.\n\nShow:\n\nNEW DAILY SHINE BOOKING\n\nCustomer:\n\n[Name]\n\nVehicle:\n\n[Vehicle]\n\nArea:\n\n[Area]\n\nService:\n\nDaily Shine\n\nBooking amount:\n\n[Amount]\n\nStatus:\n\nUNASSIGNED\n\nAdd:\n\nOpen Booking →\n\nAlso:\n\n- increment unread notification count\n\n- show visible alert/toast\n\n- play a notification sound once for this new event\n\n- keep it unread until admin opens it\n\nDo not repeatedly play the sound on rerenders or page refresh.\n\n==================================================\n\n3. ADMIN ASSIGNS PARTNER\n\n==================================================\n\nWhen Admin opens the booking, show eligible partners for that customer's\n\nservice area.\n\nAdmin selects ONE partner.\n\nThen click:\n\nASSIGN PARTNER\n\nValidate:\n\n- booking is paid\n\n- booking is still unassigned\n\n- partner is active\n\n- partner is eligible for the area\n\n- partner is available according to existing business rules\n\n==================================================\n\n4. ATOMIC ASSIGNMENT\n\n==================================================\n\nAssignment must be one atomic backend operation.\n\nOn success update:\n\nbooking.assigned_partner_id\n\nassignment record\n\nbooking status = ASSIGNED\n\nAlso create:\n\npartner notification\n\ncustomer notification\n\nadmin audit event\n\nNever leave a partial assignment.\n\n==================================================\n\n5. PARTNER UPDATE\n\n==================================================\n\nImmediately after Admin assigns Partner X:\n\nPartner must see:\n\nNEW SERVICE ASSIGNMENT\n\nCustomer:\n\n[Customer]\n\nVehicle:\n\n[Vehicle]\n\nArea:\n\n[Area]\n\nService:\n\nDaily Shine\n\nPartner must receive:\n\n- real Android push, if token/permission is available\n\n- in-app notification\n\n- assignment in Available Work / assigned work\n\nPush failure must NOT prevent the assignment from appearing in-app.\n\n==================================================\n\n6. CUSTOMER UPDATE\n\n==================================================\n\nImmediately after assignment:\n\nCustomer receives:\n\nPARTNER ASSIGNED\n\n[Partner Name] has been assigned to your Daily Shine service.\n\nInclude:\n\nvehicle\n\nservice\n\npartner\n\nassignment_id\n\nservice_id\n\nvehicle_id\n\nCustomer must receive:\n\n- real Android push\n\n- in-app notification\n\nThe push must work even when the customer currently has another vehicle\n\nselected.\n\n==================================================\n\n7. MULTI-VEHICLE CUSTOMER\n\n==================================================\n\nPush recipient is the CUSTOMER ACCOUNT.\n\nNOT the currently selected vehicle.\n\nIf customer owns:\n\nVehicle A\n\nVehicle B\n\nVehicle C\n\nand Vehicle B is assigned to Partner X while Vehicle A is selected:\n\ncustomer MUST still receive the notification.\n\nTapping the notification must open the correct Vehicle B/service details.\n\n==================================================\n\n8. SYNCHRONIZE ALL SCREENS\n\n==================================================\n\nAfter Admin assigns Partner X:\n\nADMIN:\n\nPAID / UNASSIGNED\n\n→ ASSIGNED\n\n→ Partner X\n\nPARTNER:\n\nNo assignment\n\n→ New assignment appears\n\nCUSTOMER:\n\nNo partner assigned\n\n→ Partner X assigned\n\nAll screens must use the SAME authoritative booking/assignment data.\n\nNo manual refresh should be required.\n\n==================================================\n\n9. DO NOT USE AUTOMATIC PARTNER BROADCAST\n\n==================================================\n\nFor Daily Shine bookings, Admin assignment is now the authoritative flow.\n\nDo not allow the old:\n\nCustomer → broadcast to many partners → first partner wins\n\nflow to automatically claim the booking.\n\nAdmin must explicitly select the partner.\n\n==================================================\n\n10. SERVICE LIFECYCLE\n\n==================================================\n\nAfter assignment, keep the existing service workflow.\n\nPartner:\n\nSTART\n\n→ service screen\n\n→ vehicle condition\n\n→ photo\n\n→ COMPLETE / UNAVAILABLE / NEED WASH\n\nAll outcomes must update:\n\nPartner\n\nCustomer\n\nAdmin\n\nfrom the same service record.\n\n==================================================\n\n11. ADMIN SERVICE NOTIFICATIONS\n\n==================================================\n\nAdmin must also receive alerts for important events:\n\nNEW PAID BOOKING\n\nPARTNER ASSIGNED\n\nSERVICE STARTED\n\nSERVICE COMPLETED\n\nUNAVAILABLE\n\nNEED WASH\n\nFor important new events:\n\n- unread badge increases\n\n- visible alert\n\n- notification sound once\n\n- notification remains in Admin Notifications history\n\n==================================================\n\n12. REAL E2E TEST\n\nTest with:\n\n1 real customer\n\n1 real admin\n\n1 real partner\n\nreal Android Customer + Partner devices\n\nTEST:\n\nCustomer books Daily Shine\n\n→ Admin gets notification + sound\n\n→ Admin opens booking\n\n→ Admin assigns Partner X\n\n→ Partner receives assignment\n\n→ Customer receives \"Partner X assigned\"\n\n→ Partner starts service\n\n→ Partner completes service\n\n→ Customer receives completion push\n\n→ Admin sees completed status\n\n→ Partner earnings/progress update\n\n→ Customer service history/usage update\n\nDo NOT consider database rows or in-app notifications alone as successful push\n\ndelivery.\n\nFINAL REQUIREMENT:\n\nThe complete authoritative flow must be:\n\nCUSTOMER\n\n→ BOOKING\n\n→ ADMIN ALERT\n\n→ ADMIN ASSIGN\n\n→ PARTNER ASSIGNED\n\n→ CUSTOMER INFORMED\n\n→ SERVICE\n\n→ COMPLETION\n\n→ ALL SYSTEMS SYNCHRONIZED.\n\nFix the backend, realtime state, notification dispatch, and Android push path\n\nwhere required to make this flow actually work E2E.`;

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
