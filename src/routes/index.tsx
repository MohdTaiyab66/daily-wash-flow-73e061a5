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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            P0 FINAL VERIFICATION — ADMIN MANUAL DAILY SHINE ASSIGNMENT

DO NOT CHANGE CODE UNLESS A TEST FAILS.

The legacy partner_profiles issue has now been fixed and the authoritative

partner source is public.partners.

Run a completely fresh Daily Shine E2E test.

==================================================

1. CUSTOMER BOOKING

==================================================

Create a NEW Daily Shine booking.

Verify:

payment = SUCCESS

booking status = PAID / UNASSIGNED

booking_id exists

==================================================

2. ADMIN NOTIFICATION

==================================================

Verify Admin receives:

NEW PAID BOOKING

unread count increases

sound plays once

Click OPEN.

Expected:

exact booking assignment page opens

NO "Booking not found"

==================================================

3. BOOKING DETAILS

==================================================

Verify the page shows the exact:

Customer

Vehicle

Daily Shine

Area

Booking ID

Amount

Payment status

==================================================

4. PARTNER LIST

==================================================

The partner list must now use:

public.partners

Verify:

- partner name is correct

- phone is correct

- home_area is correct

- active/approved status is correct

- eligible Kalyanpur (West) partners are shown

- unrelated-area partners are excluded

- "No area" is NOT shown when home_area exists

==================================================

5. ASSIGN PARTNER

==================================================

Select ONE eligible Kalyanpur (West) partner.

Click:

ASSIGN PARTNER

Verify:

NO partner_profiles error

NO database error

assignment succeeds

==================================================

6. DATABASE VERIFICATION

==================================================

After assignment verify:

booking.assigned_partner_id

assignment record

service record

booking status

subscription/service state

All must point to the same:

booking_id

partner_id

service_id

customer_id

vehicle_id

==================================================

7. PARTNER APP

==================================================

Verify the assigned partner sees the booking in the Partner App.

If FCM token exists:

real Android push = RECEIVED

Even if push fails:

in-app assignment MUST still appear.

==================================================

8. CUSTOMER APP

==================================================

Customer must receive:

PARTNER ASSIGNED

with:

partner name

vehicle

Daily Shine service

Verify it targets the customer's account, not only the currently selected

vehicle.

==================================================

9. ADMIN STATE

==================================================

Admin should now show:

ASSIGNED

Partner: [selected partner]

The same partner must appear everywhere.

==================================================

10. SERVICE TEST

==================================================

Partner performs:

START

→ vehicle condition

→ photo

→ COMPLETE

Then verify:

Partner progress updated

Partner earnings updated

Customer service history updated

Customer entitlement updated

Admin booking/service status updated

Customer completion notification sent

==================================================

11. FAILURE TEST

==================================================

Also verify the important fallback:

Disable/fail partner push delivery.

Admin must STILL be able to:

OPEN BOOKING

→ SELECT PARTNER

→ ASSIGN PARTNER

The assignment must not depend on FCM.

==================================================

FINAL REPORT

Provide actual IDs:

booking_id

service_id

assignment_id

customer_id

vehicle_id

partner_id

And:

Admin notification = PASS/FAIL

Admin sound = PASS/FAIL

Open booking = PASS/FAIL

Correct partners = PASS/FAIL

Area matching = PASS/FAIL

Assign Partner = PASS/FAIL

Partner app update = PASS/FAIL

Partner push = PASS/FAIL

Customer update = PASS/FAIL

Customer push = PASS/FAIL

Service completion = PASS/FAIL

Earnings update = PASS/FAIL

Customer history = PASS/FAIL

If anything fails, provide the exact error and failing layer before making

another change.

Do not declare success from code inspection alone.`;

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