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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n\nURBAN WASH — P0 FIX: ADMIN BOOKING "NOT FOUND"\n\nDO NOT redesign the Admin Console.\n\nREAL ISSUE:\n\nCustomer books a Daily Shine service.\n\nAdmin receives the notification and the sound works correctly.\n\nWhen Admin clicks:\n\nOPEN →\n\nthe browser navigates to:\n\n/admin/assign-booking/<id>\n\nbut the page shows:\n\n"Booking not found"\n\nTherefore the notification is firing, but the booking/assignment page is not\n\nresolving the correct booking record.\n\nFIX THIS E2E.\n\n==================================================\n\n1. USE THE CANONICAL BOOKING ID\n\n==================================================\n\nTrace the NEW PAID DAILY SHINE notification from creation to click.\n\nThe notification must contain the actual canonical:\n\nbooking_id\n\nfrom the authoritative bookings record.\n\nDo NOT use:\n\n- service_id as booking_id\n\n- subscription_id as booking_id\n\n- marketplace_offer_id\n\n- assignment_id\n\n- customer_id\n\n- vehicle_id\n\n- latest booking\n\n- first booking\n\n- cached booking\n\nCheck the actual admin_notifications row for a fresh booking and verify its\n\nbooking reference.\n\n==================================================\n\n2. FIX THE OPEN ACTION\n\n==================================================\n\nWhen Admin clicks OPEN:\n\nresolve the exact booking from the ID stored in the notification.\n\nExpected:\n\nAdmin Notification\n\n→ booking_id\n\n→ /admin/assign-booking/:bookingId\n\n→ exact booking loaded\n\nDo not create another booking lookup system.\n\nUse the same authoritative booking source already used by the Admin booking\n\nnotifications.\n\n==================================================\n\n3. FIX THE ASSIGNMENT PAGE\n\n==================================================\n\nAudit:\n\nsrc/routes/admin.assign-booking.$id.tsx\n\nand the function/query it uses to load the booking.\n\nThe page must correctly load:\n\nCustomer\n\nVehicle\n\nService\n\nArea\n\nBooking amount\n\nPayment status\n\nBooking ID\n\nAssignment status\n\nFor a fresh paid Daily Shine booking, it must NOT show "Booking not found".\n\n==================================================\n\n4. HANDLE REAL DATA SAFELY\n\n==================================================\n\nThe booking may be identified through the existing relationship:\n\nbooking\n\n→ service\n\n→ vehicle\n\n→ customer\n\nUse the existing canonical relationship.\n\nDo not assume booking ID equals service ID.\n\nIf the notification currently stores the wrong ID, fix the notification\n\ncreation at the source instead of adding frontend hacks.\n\n==================================================\n\n5. ASSIGN PARTNER\n\n==================================================\n\nOnce the booking loads, the Admin should immediately see:\n\nELIGIBLE AREA PARTNERS\n\nAdmin selects ONE partner and clicks:\n\nASSIGN PARTNER\n\nUse the existing atomic:\n\nadmin_assign_partner_to_booking(\n\n  booking_id,\n\n  partner_id\n\n)\n\nor the authoritative equivalent.\n\n==================================================\n\n6. REQUIRED BUSINESS FLOW\n\n==================================================\n\nCustomer:\n\nBOOK + PAYMENT SUCCESS\n\n↓\n\nAdmin:\n\nNEW PAID BOOKING\n\n+ SOUND\n\n+ UNREAD ALERT\n\n↓\n\nAdmin clicks OPEN\n\n↓\n\nEXACT BOOKING ASSIGNMENT PAGE\n\n↓\n\nAdmin selects eligible partner\n\n↓\n\nASSIGN PARTNER\n\n↓\n\nPartner gets assignment\n\n↓\n\nCustomer gets:\n\n"Partner X has been assigned"\n\nAll screens must update from the same assignment record.\n\n==================================================\n\n7. DO NOT USE OLD MARKETPLACE\n\n==================================================\n\nFor this Admin-controlled Daily Shine flow:\n\nDo NOT redirect the Admin to:\n\n/admin/marketplace\n\nDo NOT automatically broadcast or auto-claim the booking.\n\nAdmin assignment is authoritative.\n\n==================================================\n\n8. REAL E2E TEST\n\n==================================================\n\nCreate a NEW Daily Shine booking after the fix.\n\nTest:\n\n1. Payment succeeds.\n\n2. Admin receives notification.\n\n3. Sound plays.\n\n4. Click OPEN.\n\n5. Exact booking loads.\n\n6. Customer/vehicle/service/area are correct.\n\n7. Eligible partners are shown.\n\n8. Admin assigns one partner.\n\n9. Partner assignment appears.\n\n10. Customer gets Partner Assigned notification.\n\n11. Admin status changes to ASSIGNED.\n\nUse a fresh booking only.\n\n==================================================\n\n9. REQUIRED DIAGNOSTIC RESULT\n\n==================================================\n\nBefore saying fixed, report:\n\nnotification_id\n\nbooking_id stored in notification\n\nbooking_id loaded by assignment page\n\nservice_id\n\ncustomer_id\n\nvehicle_id\n\nassignment_id\n\nThen explicitly confirm:\n\nNotification booking_id == Assignment page booking_id\n\nIf these IDs differ, fix the source of the mismatch.\n\nDO NOT solve this by hardcoding or using the latest booking.\n\nFINAL ACCEPTANCE:\n\nCustomer books\n\n→ Admin sound\n\n→ Open\n\n→ exact booking loads\n\n→ Admin assigns partner\n\n→ Partner updated\n\n→ Customer updated.\n\nNo "Booking not found".`;

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
