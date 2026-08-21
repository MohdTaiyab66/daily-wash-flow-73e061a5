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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 FINAL VERIFICATION — ADMIN MANUAL ASSIGNMENT\n\nDO NOT MODIFY CODE UNLESS THE TEST FAILS.\n\nThe deterministic server-side resolver is now implemented.\n\nRun a BRAND-NEW end-to-end test using a fresh Daily Shine booking.\n\nTEST:\n\n1. Customer books Daily Shine.\n\n2. Payment succeeds.\n\n3. Admin receives NEW PAID BOOKING notification.\n\n4. Admin notification sound plays.\n\n5. Click OPEN.\n\n6. /admin/assign-booking/:bookingId loads.\n\n7. The exact booking loads successfully.\n\n8. Verify:\n\n   - Customer\n\n   - Vehicle\n\n   - Daily Shine\n\n   - Area\n\n   - Payment status\n\n   - Booking ID\n\n9. Verify eligible partners for that area load.\n\n10. Admin selects one partner.\n\n11. Admin clicks ASSIGN PARTNER.\n\n12. Assignment succeeds.\n\n13. Partner assignment appears in Partner App.\n\n14. Customer receives Partner Assigned notification.\n\n15. Admin booking status becomes ASSIGNED.\n\nIMPORTANT:\n\nThe exact URL booking ID must equal the canonical bookings.id.\n\nDo not use service_id, subscription_id, vehicle_id, marketplace_offer_id or\n\nlatest booking as a fallback.\n\nAlso test the existing Search Booking ID safety net with the same fresh\n\nbookings.id.\n\n==================================================\n\nREQUIRED PROOF\n\n==================================================\n\nReturn:\n\nbooking_id\n\nservice_id\n\nnotification_id\n\nassignment_id\n\npartner_id\n\nAdmin Open = PASS/FAIL\n\nBooking resolver = PASS/FAIL\n\nPartner list = PASS/FAIL\n\nAssign Partner = PASS/FAIL\n\nPartner update = PASS/FAIL\n\nCustomer update = PASS/FAIL\n\nAlso confirm:\n\nAdmin Console project = qsnzrdoomakackspawjv\n\nWebhook project = qsnzrdoomakackspawjv\n\nCustomer project = qsnzrdoomakackspawjv\n\nIf the booking still shows \"Booking not found\", do NOT make another generic\n\nlookup change. Provide the exact server resolver error, HTTP status, and\n\ndatabase result for that booking ID.\n\nOnly call the feature fixed after a fresh booking can be manually assigned by\n\nAdmin.`;

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
