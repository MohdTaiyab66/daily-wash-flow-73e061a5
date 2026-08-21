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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URGENT P0 ROOT-CAUSE FIX — ADMIN MANUAL PARTNER ASSIGNMENT\n\n\"BOOKING NOT FOUND\" STILL EXISTS\n\nDO NOT MAKE UI CHANGES.\n\nThe Admin notification and sound are working.\n\nThe problem is now specifically the booking resolution.\n\nREAL TEST RESULT:\n\nA fresh Daily Shine booking was created.\n\nAdmin received the booking notification.\n\nAdmin clicked OPEN.\n\nBrowser correctly navigated to:\n\n/admin/assign-booking/175b0a1d-56ee-4936-8478-5212595cd725\n\nBUT THE PAGE SHOWS:\n\n\"Booking not found\"\n\nThis happened AGAIN after the previous attempted fix.\n\nTherefore the underlying data lookup is still wrong.\n\nThe goal of this feature is critical:\n\nIF PARTNER PUSH NOTIFICATION FAILS,\n\nADMIN MUST STILL BE ABLE TO OPEN THE EXACT PAID BOOKING\n\nAND MANUALLY ASSIGN A PARTNER.\n\n==================================================\n\n1. STOP PATCHING THE FRONTEND\n\n==================================================\n\nDo not solve this with:\n\n- latest booking\n\n- first booking\n\n- fallback booking\n\n- hardcoded ID\n\n- cached booking\n\n- service ID guessed as booking ID\n\n- customer ID\n\n- vehicle ID\n\nFind the REAL root cause.\n\n==================================================\n\n2. TRACE ONE FRESH BOOKING END TO END\n\n==================================================\n\nCreate ONE new Daily Shine booking.\n\nCapture the exact IDs at creation:\n\nbooking_id\n\nservice_id\n\nsubscription_id\n\nvehicle_id\n\ncustomer_id\n\npayment/order ID\n\nThen inspect the corresponding row in:\n\nadmin_notifications\n\nShow exactly what is stored in:\n\nnotification metadata\n\nentity ID\n\nbooking_id\n\nreference ID\n\nclick_action\n\ndeep_link\n\nThen compare it with the URL:\n\n/admin/assign-booking/<ID>\n\nTHESE MUST MATCH THE CANONICAL bookings.id.\n\n==================================================\n\n3. VERIFY THE ACTUAL DATABASE RECORD\n\n==================================================\n\nTake the exact failing ID:\n\n175b0a1d-56ee-4936-8478-5212595cd725\n\nQuery the authoritative bookings table directly.\n\nDetermine:\n\nDoes this ID actually exist in bookings.id?\n\nIf YES:\n\nwhy is the assignment page unable to read it?\n\nIf NO:\n\nwhat record does this ID actually belong to?\n\nDo NOT assume that the ID in the URL is a booking ID.\n\nShow the exact database result.\n\n==================================================\n\n4. CHECK FOR ID TYPE / RELATIONSHIP MISMATCH\n\n==================================================\n\nAudit the complete relationship:\n\nbooking\n\n→ service\n\n→ vehicle\n\n→ customer\n\n→ payment\n\n→ assignment\n\nCheck whether the Admin notification is actually generated from:\n\nservice.id\n\ninstead of:\n\nbooking.id\n\nAlso check whether the webhook receives one ID and creates the booking using\n\nanother ID.\n\nThe final notification must use:\n\nbookings.id\n\nas the assignment-page identifier.\n\n==================================================\n\n5. AUDIT admin.assign-booking.$id.tsx\n\n==================================================\n\nInspect exactly how the page reads params.$id.\n\nVerify:\n\n- route parameter is read correctly\n\n- no malformed UUID transformation\n\n- no URL decoding problem\n\n- no query accidentally using service_id\n\n- no query requiring assigned_partner_id\n\n- no query requiring a marketplace offer\n\n- no query requiring today's date\n\n- no query requiring active assignment\n\n- no query requiring a specific status\n\nA PAID / UNASSIGNED booking MUST be loadable.\n\nThe page must not require an existing assignment because the purpose of the\n\npage is to CREATE the assignment.\n\n==================================================\n\n6. CHECK RLS / AUTHORIZATION\n\n==================================================\n\nThis is extremely important.\n\nThe booking may exist but the Admin page may not be able to READ it.\n\nTest the exact same booking query:\n\n- using the Admin user's authenticated session\n\n- using the current role\n\n- using the actual Admin Console environment\n\nCheck RLS policies on:\n\nbookings\n\nservices\n\nvehicles\n\ncustomers\n\npayments\n\nassignments\n\nIf the database contains the booking but the Admin query returns zero rows\n\nbecause of RLS, FIX THE ADMIN READ POLICY.\n\nDo not hide the error as \"Booking not found.\"\n\nA real authorization/query failure must be distinguishable from a genuinely\n\nmissing booking.\n\n==================================================\n\n7. CHECK PAYMENT WEBHOOK CREATION\n\n==================================================\n\nAudit:\n\nsrc/routes/api/public/razorpay-webhook.ts\n\nTrace:\n\nRazorpay payment success\n\n→ booking creation\n\n→ admin_notification creation\n\nConfirm that the notification is created ONLY AFTER the canonical booking\n\nrecord exists.\n\nThe notification must reference the newly created bookings.id.\n\nDo not create the notification using an earlier temporary ID.\n\n==================================================\n\n8. ADD TEMPORARY FORENSIC LOGGING\n\n==================================================\n\nFor ONE new booking log:\n\n[ADMIN-BOOKING-E2E]\n\npayment/order_id\n\nbooking_id\n\nservice_id\n\ncustomer_id\n\nvehicle_id\n\nnotification_id\n\nnotification_booking_id\n\nnotification_click_action\n\nroute_booking_id\n\nassignment_lookup_booking_id\n\nbooking_query_result\n\nRLS/auth result\n\nThe goal is to see exactly where the ID changes or disappears.\n\n==================================================\n\n9. MAKE ADMIN ASSIGNMENT INDEPENDENT OF MARKETPLACE\n\n==================================================\n\nIMPORTANT:\n\nThis manual Admin assignment page must NOT depend on:\n\nmarketplace_offers\n\nbroadcasts\n\npartner push tokens\n\npartner notifications\n\npartner online status\n\nThe booking is already PAID.\n\nAdmin must be able to assign a partner even when:\n\n- no partner received push\n\n- no partner has a valid FCM token\n\n- marketplace offer was not created\n\n- marketplace is offline\n\nThe authoritative flow is:\n\nPAID BOOKING\n\n→ ADMIN OPENS BOOKING\n\n→ ADMIN SELECTS PARTNER\n\n→ ASSIGNMENT\n\n==================================================\n\n10. ASSIGNMENT PAGE REQUIREMENT\n\n==================================================\n\nOnce the exact booking loads, show:\n\nCUSTOMER\n\nVEHICLE\n\nDAILY SHINE\n\nAREA\n\nBOOKING DATE/TIME\n\nPAYMENT STATUS\n\nBOOKING ID\n\nThen:\n\nELIGIBLE AREA PARTNERS\n\nAdmin selects ONE partner.\n\nThen:\n\nASSIGN PARTNER\n\nUse the existing atomic:\n\nadmin_assign_partner_to_booking(\n\n  p_booking_id,\n\n  p_partner_id\n\n)\n\nor the correct authoritative equivalent.\n\n==================================================\n\n11. DO NOT BREAK OLD ADMIN FEATURES\n\n==================================================\n\nDo not remove:\n\nNotifications\n\nBookings\n\nMarketplace\n\nDaily Shine Offers\n\nLive Offers\n\nServices\n\nPayments\n\nPartner management\n\nBut Daily Shine manual assignment must NOT depend on the old marketplace.\n\n==================================================\n\n12. CRITICAL FALLBACK\n\n==================================================\n\nEven if notification deep-linking breaks in the future, Admin must still be\n\nable to find the booking manually.\n\nAdd an existing Admin booking/search path where Admin can search by:\n\nbooking ID\n\ncustomer name\n\nvehicle\n\nphone\n\nand open the same assignment page.\n\nThis is a SAFETY NET only.\n\nDo not use it to hide the current ID bug.\n\n==================================================\n\n13. REAL E2E TEST\n\n==================================================\n\nCreate a BRAND NEW Daily Shine booking.\n\nThen verify:\n\n1. Payment succeeds.\n\n2. booking row exists.\n\n3. booking has canonical booking_id.\n\n4. Admin notification created.\n\n5. notification stores SAME booking_id.\n\n6. Open URL contains SAME booking_id.\n\n7. assignment page queries SAME booking_id.\n\n8. Admin can see customer/vehicle/area/payment.\n\n9. Eligible partners load.\n\n10. Admin assigns partner.\n\n11. assignment record created.\n\n12. booking assigned_partner_id updated.\n\nThen separately test:\n\nPartner push fails\n\n→ Admin can STILL manually assign partner.\n\n==================================================\n\n14. REQUIRED REPORT\n\n==================================================\n\nDo NOT reply \"fixed\" without evidence.\n\nReport the exact values for the failing/new test:\n\nbooking_id:\n\nservice_id:\n\nnotification_id:\n\nnotification booking_id:\n\nURL booking id:\n\nassignment lookup id:\n\nAnd explicitly state:\n\nbooking exists in DB: YES/NO\n\nAdmin can read booking under RLS: YES/NO\n\nnotification ID matches booking ID: YES/NO\n\nassignment page loads booking: YES/NO\n\neligible partners load: YES/NO\n\nmanual assignment works: YES/NO\n\nMOST IMPORTANT:\n\nFind exactly why the page says \"Booking not found\".\n\nDo not make another superficial ID propagation change.\n\nTrace the real booking from payment → bookings table → notification → URL →\n\nassignment query → Admin RLS.\n\nFix the root cause so Admin can ALWAYS manually assign a paid Daily Shine\n\nbooking even when partner notifications fail.`;

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
