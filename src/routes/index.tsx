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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 — FINAL ROOT-CAUSE FIX: ADMIN ASSIGN BOOKING STILL SAYS \"BOOKING NOT FOUND\"\n\nDO NOT MAKE UI CHANGES.\n\nREAL TEST RESULT:\n\nFresh Daily Shine booking was created.\n\nAdmin notification works.\n\nAdmin sound works.\n\nClicking OPEN reaches:\n\n/admin/assign-booking/8fb669dd-7d24-41a0-bac2-d01d86b35124\n\nBUT THE PAGE STILL SHOWS:\n\n\"Booking not found\"\n\nThis is still broken after the previous admin_booking_details view fix.\n\nSTOP CLAIMING THIS IS FIXED.\n\nWe need a deterministic Admin booking resolver so Admin can ALWAYS manually\n\nassign a partner to a paid Daily Shine booking even if partner notifications\n\nfail.\n\n==================================================\n\n1. INVESTIGATE THE EXACT UUID\n\n==================================================\n\nUse this exact failing ID:\n\n8fb669dd-7d24-41a0-bac2-d01d86b35124\n\nDo NOT assume it is a booking ID.\n\nDetermine exactly what this UUID belongs to.\n\nCheck:\n\nbookings.id\n\nservices.id\n\nsubscriptions.id\n\nmarketplace_offers.id\n\nassignments.id\n\nadmin_notifications reference fields\n\nReturn the exact matching record/table.\n\nIf this UUID does not exist in bookings.id, identify which ID is being placed\n\ninto the Admin notification/deep link.\n\n==================================================\n\n2. TRACE THE FRESH BOOKING\n\n==================================================\n\nCreate another NEW Daily Shine booking.\n\nCapture ALL identifiers:\n\nbooking_id\n\nservice_id\n\nsubscription_id\n\nvehicle_id\n\ncustomer_id\n\npayment_id/order_id\n\nadmin_notification_id\n\nThen show:\n\nREAL bookings.id\n\n↓\n\nID stored in admin_notifications\n\n↓\n\nID placed in click_action\n\n↓\n\nID in browser URL\n\n↓\n\nID received by admin.assign-booking.$id.tsx\n\n↓\n\nID used in database query\n\nThese MUST be the canonical bookings.id.\n\nDo not patch this by guessing.\n\n==================================================\n\n3. BYPASS THE VIEW TEMPORARILY\n\n==================================================\n\nThe previous admin_booking_details view apparently did not solve the problem.\n\nFor the assignment page, temporarily query the canonical bookings table\n\nDIRECTLY by:\n\nbookings.id = route parameter\n\nDo not use:\n\n!inner\n\nservice joins\n\ncustomer joins\n\nmarketplace joins\n\nsubscription joins\n\nfor the initial booking existence check.\n\nFirst prove:\n\nDoes this exact bookings.id exist?\n\nThen separately load related:\n\ncustomer\n\nvehicle\n\nservice\n\npayment\n\narea\n\nThis separates booking existence from relationship/query problems.\n\n==================================================\n\n4. CHECK RLS DIRECTLY\n\n==================================================\n\nRun the direct booking lookup using the actual authenticated Admin session.\n\nTest:\n\nSELECT booking by exact ID\n\nIf SQL/service role can find it but Admin client cannot:\n\nTHE PROBLEM IS RLS.\n\nFix the Admin read policy.\n\nDo not display \"Booking not found\" for an authorization failure.\n\nLog the real error.\n\n==================================================\n\n5. CHECK ENVIRONMENT MISMATCH\n\n==================================================\n\nThis is extremely important.\n\nVerify that:\n\nAdmin Console\n\nCustomer App\n\nPartner App\n\nRazorpay webhook\n\nare all connected to the SAME Supabase project/environment.\n\nCheck:\n\nSUPABASE_URL\n\nproject reference\n\ndatabase environment\n\nIt is possible for the webhook to create the booking in one environment\n\nwhile the Admin preview reads another database.\n\nIf the booking exists in one database but not the Admin preview database,\n\nthis exactly explains the repeated \"Booking not found.\"\n\nREPORT THE PROJECT REFERENCE FOR:\n\n1. webhook\n\n2. Admin Console\n\n3. current preview\n\nThey must match.\n\n==================================================\n\n6. CHECK AUTHENTICATED USER / ADMIN ROLE\n\n==================================================\n\nVerify the current Admin session has the correct role.\n\nConfirm:\n\nauthenticated user ID\n\nuser_roles row\n\nadmin role\n\nbooking read permission\n\nDo not rely on UI appearance to determine Admin authorization.\n\n==================================================\n\n7. REMOVE FALSE \"NOT FOUND\"\n\n==================================================\n\nChange the assignment page logic so that errors are distinguished:\n\nBOOKING DOES NOT EXIST\n\n→ \"Booking not found\"\n\nBOOKING EXISTS BUT ACCESS DENIED\n\n→ \"You do not have permission to view this booking\"\n\nDATABASE / NETWORK ERROR\n\n→ \"Unable to load booking. Retry.\"\n\nThis will expose the real failure instead of hiding it.\n\n==================================================\n\n8. CREATE A DETERMINISTIC SERVER RESOLVER\n\n==================================================\n\nCreate one authoritative server function such as:\n\ngetAdminBookingForAssignment(bookingId)\n\nIt must:\n\n1. Validate UUID.\n\n2. Query bookings by exact ID.\n\n3. Confirm booking exists.\n\n4. Confirm payment/booking status.\n\n5. Fetch related customer/vehicle/service information separately.\n\n6. Return one normalized Admin booking object.\n\nThe Admin assignment page should consume ONLY this resolver.\n\nDo not duplicate booking-resolution logic across multiple pages.\n\n==================================================\n\n9. MANUAL SEARCH FALLBACK\n\n==================================================\n\nThe Admin Notifications page already has Search Booking ID.\n\nMake sure that entering a REAL bookings.id:\n\n→ opens the SAME resolver\n\n→ loads the booking\n\n→ shows customer/vehicle/area\n\n→ shows eligible partners\n\n→ allows assignment.\n\nDo not make the search use a different lookup path.\n\n==================================================\n\n10. ADMIN MUST BE ABLE TO ASSIGN WITHOUT MARKETPLACE\n\n==================================================\n\nThis page must work even if:\n\n- no partner push\n\n- no partner FCM token\n\n- marketplace is disabled\n\n- no marketplace_offer exists\n\n- partner is offline\n\nThe only requirement is:\n\nPAID BOOKING EXISTS\n\nThen Admin can manually assign an eligible partner.\n\n==================================================\n\n11. ASSIGNMENT SCREEN\n\n==================================================\n\nOnce loaded, display:\n\nCustomer\n\nVehicle\n\nDaily Shine\n\nArea\n\nBooking date/time\n\nPayment status\n\nBooking ID\n\nThen:\n\nELIGIBLE PARTNERS\n\nAdmin chooses one:\n\nASSIGN PARTNER\n\nUse the existing atomic assignment RPC.\n\n==================================================\n\n12. FRESH E2E TEST\n\n==================================================\n\nAfter fixing:\n\nCreate NEW Daily Shine booking.\n\nVerify:\n\nPayment = SUCCESS\n\nBooking exists:\n\nYES\n\nAdmin notification:\n\nYES\n\nSound:\n\nYES\n\nOpen route:\n\nYES\n\nExact booking loads:\n\nYES\n\nEligible partners:\n\nYES\n\nAdmin assignment:\n\nYES\n\nPartner receives assignment:\n\nYES\n\nCustomer receives Partner Assigned:\n\nYES\n\n==================================================\n\n13. REQUIRED FORENSIC REPORT\n\n==================================================\n\nDo NOT respond with \"fixed\" only.\n\nReturn:\n\nfailing UUID:\n\n8fb669dd-7d24-41a0-bac2-d01d86b35124\n\nwhat table this UUID belongs to:\n\n____\n\nactual canonical bookings.id:\n\n____\n\nnotification stored ID:\n\n____\n\nURL ID:\n\n____\n\nAdmin query result:\n\n____\n\nRLS result:\n\n____\n\nSupabase project reference:\n\n____\n\nAdmin project reference:\n\n____\n\nwebhook project reference:\n\n____\n\nFINAL ROOT CAUSE:\n\n____\n\nEXACT FILES CHANGED:\n\n____\n\nEXACT RPC/server function:\n\n____\n\nCOMMIT SHA:\n\n____\n\nMost importantly:\n\nDO NOT add another superficial fallback.\n\nFind why the Admin preview cannot load a booking that the system says exists,\n\nfix that exact cause, and prove it with a BRAND-NEW booking.`;

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
