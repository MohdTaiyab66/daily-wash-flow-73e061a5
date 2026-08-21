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

                                            URBAN WASH — P0 FORENSIC FIX: "COLUMN booking_id DOES NOT EXIST"

The previous issues are now resolved:

- Booking loads correctly

- partner_profiles error is resolved

- partner selection works

- bookings_status_check issue is resolved

- booking status is now correctly handled as "active"

NEW REAL ERROR WHEN CLICKING "ASSIGN PARTNER":

column "booking_id" does not exist

DO NOT MAKE UI CHANGES.

This is now a DATABASE SCHEMA MISMATCH inside the assignment transaction.

==================================================

1. FIND THE EXACT SOURCE

==================================================

Search the COMPLETE call chain:

Admin Assign Partner button

→ assignPartnerToBooking

→ admin_assign_partner_to_booking

→ helper functions

→ assignment INSERT/UPDATE

→ service INSERT/UPDATE

→ subscription UPDATE

→ triggers

→ notification functions

→ audit functions

Find the EXACT SQL statement producing:

column "booking_id" does not exist

Do not assume the error is directly inside the top-level RPC.

==================================================

2. INSPECT THE LIVE DATABASE SCHEMA

==================================================

Inspect the actual live columns for these tables:

public.bookings

public.assignments

public.services

public.subscriptions

public.partner_assignments

public.admin_notifications

and any other table touched by:

admin_assign_partner_to_booking

For every relevant table, return the actual column names.

Especially determine:

Which table stores the booking relationship?

Which column references the booking?

Examples might be:

booking_id

service_id

subscription_id

id

request_id

assignment_id

BUT DO NOT ASSUME.

Use the REAL live schema.

==================================================

3. CHECK THE ASSIGNMENTS TABLE

==================================================

The most important investigation is the table where the partner assignment

record is created.

Inspect its live definition.

Determine:

Does assignments have:

booking_id?

service_id?

subscription_id?

or another foreign key?

If assignments does NOT have booking_id, the RPC must use the correct

existing relationship.

Do not add a duplicate booking_id column just to make the RPC work unless

the existing architecture genuinely requires it.

==================================================

4. CHECK SERVICES TABLE

==================================================

Daily Shine may be represented through the service record rather than a

direct booking relationship.

Determine the real relationship:

booking

→ subscription

→ service

or:

booking

→ service

or whatever the current application actually uses.

Then make the assignment RPC follow that existing relationship.

==================================================

5. CHECK THE PREVIOUSLY MODIFIED RPC

==================================================

Inspect BOTH LIVE overloads:

admin_assign_partner_to_booking(

  booking_id,

  partner_id

)

admin_assign_partner_to_booking(

  booking_id,

  partner_id,

  admin_id

)

Show every INSERT and UPDATE they perform.

Find every occurrence of:

booking_id

inside SQL expressions.

For each occurrence, state:

TABLE:

COLUMN:

PURPOSE:

Then verify that column actually exists in that table.

==================================================

6. CHECK TRIGGERS AND HELPERS

==================================================

Even if both RPCs are correct, a trigger/helper can still produce:

column "booking_id" does not exist

Inspect every trigger/function executed by the assignment transaction.

Especially check:

assignment creation

service creation

subscription activation

notification creation

admin audit logging

The goal is to identify the EXACT statement generating the error.

==================================================

7. DO NOT PATCH BY ADDING RANDOM COLUMNS

==================================================

Do NOT create:

booking_id

on an unrelated table just to suppress the error.

First determine the existing canonical relationship.

Urban Wash must have ONE authoritative relationship between:

booking

customer

vehicle

subscription

service

assignment

partner

Reuse the existing model.

==================================================

8. VERIFY PARTNER ASSIGNMENT DATA

==================================================

The selected partner is:

P0 Trial Partner 891379

Booking:

c4ff90a1-1dc6-4c8c-93e5-01f6f37b4590

Test the exact assignment again.

Verify:

booking exists

partner exists

partner is eligible

assignment relationship is valid

==================================================

9. TRANSACTION REQUIREMENT

==================================================

The Admin assignment must atomically:

1. Verify booking exists

2. Verify payment is successful

3. Verify booking is currently unassigned

4. Verify partner exists

5. Verify partner eligibility

6. Create assignment using the REAL assignment schema

7. Set booking/assignment state using VALID existing fields

8. Create/update service record using REAL relationships

9. Update subscription if required by existing lifecycle

10. Create partner notification

11. Create customer notification

12. Create admin audit record

FCM failure must NOT roll back the database assignment.

==================================================

10. ADMIN FLOW MUST REMAIN INDEPENDENT

==================================================

Admin must be able to assign a paid Daily Shine booking even if:

- partner push failed

- FCM token does not exist

- marketplace is disabled

- no marketplace_offer exists

- partner is offline

The database assignment is authoritative.

==================================================

11. REQUIRED FORENSIC OUTPUT

==================================================

Do NOT respond with "fixed" only.

Return:

EXACT ERROR SOURCE:

____

TABLE CAUSING ERROR:

____

INVALID COLUMN:

booking_id

SQL STATEMENT:

____

ACTUAL TABLE COLUMNS:

____

CORRECT BOOKING RELATIONSHIP:

____

ASSIGNMENTS TABLE PRIMARY KEY:

____

ASSIGNMENTS → BOOKING RELATIONSHIP:

____

SERVICE → BOOKING RELATIONSHIP:

____

RPC OVERLOAD USED:

____

HELPER/TRIGGER RESPONSIBLE:

____

FIX APPLIED:

____

==================================================

12. FINAL E2E TEST

==================================================

Using the same booking:

c4ff90a1-1dc6-4c8c-93e5-01f6f37b4590

select:

P0 Trial Partner 891379

click:

ASSIGN PARTNER

Expected:

NO booking_id column error

NO partner_profiles error

NO bookings_status_check error

Assignment succeeds.

Then verify:

assignment record exists

booking assignment state updated

service state updated

partner receives assignment

customer receives Partner Assigned

admin sees assigned partner

==================================================

FINAL ACCEPTANCE

The exact operation must succeed:

PAID DAILY SHINE BOOKING

→ SELECT PARTNER

→ ASSIGN PARTNER

→ DATABASE COMMIT

Do not modify UI.

Do not invent columns.

Find the exact live table/function where booking_id is being referenced

incorrectly and correct it using the existing database schema.`;

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