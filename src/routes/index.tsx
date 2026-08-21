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
                                        
                                            
                                            URBAN WASH — P0 E2E FIX — PART 1

ADMIN ASSIGNMENT → PARTNER APP + ADMIN NOTIFICATION

DO NOT make unrelated UI changes.

CURRENT ISSUE:

Admin successfully assigns a partner.

Admin shows:

"Partner Manually Assigned"

Customer already shows:

"Partner X has been assigned"

BUT THE ASSIGNED PARTNER APP DOES NOT UPDATE.

The partner does not see the new assignment in:

- Partner notifications

- Home

- Available

- Daily Route

- customer list

- route

- map

- service count

- progress

- earnings

The database assignment exists, but Partner App is not consuming the new

assignment state.

==================================================

1. TRACE THE AUTHORITATIVE ASSIGNMENT

==================================================

Trace:

CUSTOMER BOOKING

→ PAYMENT

→ ADMIN NOTIFICATION

→ ADMIN ASSIGNS PARTNER

→ DATABASE ASSIGNMENT

→ PARTNER APP

Identify the exact authoritative records containing:

booking_id

assignment_id

service_id

partner_id

customer_id

vehicle_id

area

service time

assignment status

Do NOT create another assignment model.

==================================================

2. PARTNER APP MUST REFLECT ADMIN ASSIGNMENT

==================================================

Immediately after Admin assigns Partner X, the assigned Partner App must show

the new assignment.

Update:

HOME

AVAILABLE

DAILY ROUTE

NOTIFICATIONS

EARNINGS

No manual refresh should be required.

Partner must see:

Customer

Vehicle

Vehicle number

Service

Service time

Area

Assignment status

==================================================

3. REALTIME / QUERY INVALIDATION

==================================================

Audit the current Partner App data-refresh system.

Inspect:

Supabase realtime subscriptions

TanStack Query keys

today-assignment

partner home queries

daily route queries

earnings queries

notification queries

When Admin assignment is created, invalidate/refetch the correct Partner

queries immediately.

Also ensure updates occur after:

assignment

service start

service completion

unavailable

need wash

Do NOT rely only on FCM.

DATABASE ASSIGNMENT = SOURCE OF TRUTH.

PUSH = NOTIFICATION CHANNEL ONLY.

Even if FCM fails, Partner App must still update from database/realtime state.

==================================================

4. PARTNER NOTIFICATION

==================================================

After Admin assigns Partner X:

Create partner in-app notification:

NEW SERVICE ASSIGNED

Include:

Customer

Vehicle

Area

Service time

Payload must contain:

booking_id

service_id

assignment_id

vehicle_id

partner_id

Push notification should also be sent when a valid FCM token exists.

Tapping notification must open the exact assigned service.

Push failure must NOT prevent the assignment from appearing in Partner App.

==================================================

5. PARTNER HOME

==================================================

After assignment, Partner Home must immediately update:

Total assigned customers

Today's customer count

Daily potential

Assignment earning

Progress

Assignment status

Use the same authoritative assignment data.

Do not use stale marketplace data.

==================================================

6. DAILY ROUTE

==================================================

Assigned customer must immediately appear in Daily Route with:

Customer

Vehicle

Vehicle number

Service time

Location

Update:

Today's Progress

Total Customers

Remaining

Map markers

Next Stop

Up Next

The customer must appear even when FCM notification is unavailable.

==================================================

7. MAP

==================================================

The customer's location must appear on the Partner Daily Route map.

Use the authoritative:

assignment

→ vehicle/customer

→ service location

Do not use stale marketplace records.

==================================================

8. EARNINGS

==================================================

After assignment, show the correct assignment potential/expected earning.

Do NOT count it as completed yet.

After completion, actual earnings must update.

COMPLETED

UNAVAILABLE

NEED WASH

must use the existing earning rules consistently across:

Home

Daily Route

Earnings

==================================================

9. CUSTOMER STATE

==================================================

Customer must continue receiving:

"Partner X has been assigned to your Daily Shine service."

Notification must be account-based.

Multi-vehicle customers must receive the notification regardless of the

currently selected vehicle.

==================================================

10. REAL E2E TEST

==================================================

Use one fresh Daily Shine booking.

Test:

1. Customer books.

2. Payment succeeds.

3. Admin assigns Partner X.

4. Assignment record is created.

5. Partner App updates without refresh.

6. Partner notification appears.

7. Partner Daily Route updates.

8. Map updates.

9. Partner Home updates.

10. Partner earnings/potential updates.

11. Customer receives Partner Assigned notification.

Also test:

PARTNER PUSH FAILS

Even with FCM failure, Partner App MUST update from database/realtime state.

==================================================

FINAL REPORT

==================================================

Return:

booking_id

assignment_id

service_id

partner_id

customer_id

vehicle_id

Partner assignment DB = PASS/FAIL

Partner in-app notification = PASS/FAIL

Partner push = PASS/FAIL

Partner Home = PASS/FAIL

Available = PASS/FAIL

Daily Route = PASS/FAIL

Map = PASS/FAIL

Earnings = PASS/FAIL

Customer notification = PASS/FAIL

Also identify the exact realtime/query source used by Partner App.

Do not say "fixed" from code inspection only.`;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-semibold tracking-tight">Urban Wash</span>
        </div>
        <span className="text-xs text-muted-foreground whitespace-pre-wrap">{replacementText}</span>
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