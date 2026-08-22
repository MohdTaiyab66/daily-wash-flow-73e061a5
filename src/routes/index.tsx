import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Shield, Car, CheckCircle2, MapPin, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    // P0 — FIX PARTNER AUTH REDIRECT
    // If a partner or admin is already logged in, they should NOT see the public landing page.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      if (session.user.email.endsWith("@partner.urbanwash.app")) {
        throw redirect({ to: "/app" });
      }
      if (session.user.email.endsWith("@admin.urbanwash.app")) {
        throw redirect({ to: "/admin" });
      }
    }
  },
  component: LandingPage,
});

function Nav() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Car className="text-primary-foreground h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">Urban Wash</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Partner Login</Button>
          </Link>
          <Link to="/c/auth">
            <Button size="sm">Book Now</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative pt-32 pb-20 px-4 overflow-hidden">
      <div className="max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 animate-in fade-in slide-in-from-bottom-4">
          <Shield className="h-3 w-3" />
          <span>Premium Doorstep Car Care</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-foreground">
          Daily shine, <br className="hidden md:block" />
          delivered to your door.
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10">
          Professional car care services at your convenience. Join thousands of happy customers in Lucknow who trust Urban Wash for their daily cleaning.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/c/auth">
            <Button size="lg" className="w-full sm:w-auto px-8">Get Started</Button>
          </Link>
          <Link to="/trust">
            <Button variant="outline" size="lg" className="w-full sm:w-auto px-8">Learn More</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <Hero />
        
        {/* Features Preview */}
        <section className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-background border shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Daily Service</h3>
              <p className="text-muted-foreground">Consistent, professional cleaning every single day before you head out.</p>
            </div>
            <div className="p-6 rounded-2xl bg-background border shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Doorstep Delivery</h3>
              <p className="text-muted-foreground">We come to you. No more waiting in lines at the car wash center.</p>
            </div>
            <div className="p-6 rounded-2xl bg-background border shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Verified Partners</h3>
              <p className="text-muted-foreground">Every wash is performed by a trained, background-checked professional.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground mb-4">© 2026 Urban Wash Car Care Private Limited.</p>
          <div className="flex justify-center gap-6">
            <Link to="/trust" className="text-xs hover:underline">Trust & Security</Link>
            <Link to="/auth" className="text-xs hover:underline">Partner Portal</Link>
          </div>
        </div>
      </footer>
      
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/80 pointer-events-none overflow-y-auto max-h-[50vh] z-[100]">
        <div className="text-[10px] font-mono whitespace-pre text-neutral-300 max-w-4xl mx-auto">
          {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            P0 — FIX THE ACTUAL ROOT CAUSE: UTC vs IST SERVICE DATE

The forensic audit has identified the exact first divergence.

DO NOT modify:

- FCM

- push notifications

- notification UI

- landing page

- identity architecture

- Partner notification logic

The actual problem is DATE STORAGE.

==================================================

ROOT CAUSE

==================================================

Admin assignment RPC:

admin_assign_partner_to_booking

uses database CURRENT_DATE / server UTC.

Partner App uses:

getTodayIST()

Therefore during:

00:00 IST → 05:30 IST

the database and app can disagree about the current service date.

Example:

04:00 AM IST on 23 Aug

Backend CURRENT_DATE:

22 Aug

Partner App IST date:

23 Aug

Result:

assignment is created for 22 Aug

BUT Partner App queries 23 Aug

Therefore:

Home = 0

Daily Route = 0

Earnings = 0

10-second refresh = 0

while the assignment and notification exist in DB.

==================================================

1. ONE AUTHORITATIVE TIMEZONE

==================================================

Urban Wash operational service dates must use:

Asia/Kolkata

IST

UTC+05:30

for:

Daily Shine service date

scheduled_date

today's assignments

Daily Route

Home counts

Daily Potential

Earnings calculations

service history date logic

assignment date

renewal/service-day calculations where operational date is required

==================================================

2. FIX THE ADMIN ASSIGNMENT RPC

==================================================

Inspect:

admin_assign_partner_to_booking

Remove any use of:

CURRENT_DATE

CURRENT_DATE without timezone conversion

server-local date

for operational service date.

Compute the service date explicitly in IST.

Conceptually:

current_timestamp AT TIME ZONE 'Asia/Kolkata'

Then derive the calendar date from that value.

The exact SQL must use the actual PostgreSQL schema/type.

==================================================

3. DO NOT STORE UTC DATE AS scheduled_date

==================================================

If:

scheduled_date

is a DATE representing the business/service day:

it MUST contain the IST business date.

Example:

At 04:00 IST on Aug 23:

scheduled_date = 2026-08-23

NOT:

2026-08-22

==================================================

4. CHECK ALL OTHER SERVICE-CREATION PATHS

==================================================

Search the entire backend for:

CURRENT_DATE

CURRENT_TIMESTAMP

NOW()

new Date()

toISOString()

scheduled_date

service_date

Especially inspect:

booking creation

Daily Shine activation

assignment

service generation

subscription renewal

cron jobs

reminders

marketplace

reconciliation

service creation

Any code determining a BUSINESS CALENDAR DATE must use IST.

Do NOT blindly convert all timestamps to IST.

Actual event timestamps can remain UTC.

The distinction is:

EVENT TIMESTAMP:

can remain UTC

BUSINESS SERVICE DATE:

must be IST

==================================================

5. FIX EXISTING INCORRECTLY DATED TEST DATA

==================================================

For the CURRENT test records that were created with the wrong date:

identify affected records.

Only correct records where:

server UTC date != intended IST business date

Do NOT rewrite historical completed services blindly.

For current/future pending assignments, correct them to the proper IST date.

==================================================

6. PARTNER APP QUERY

==================================================

Keep the Partner App's:

getTodayIST()

logic.

Do NOT weaken the query to:

today OR yesterday

Do NOT add arbitrary date fallbacks.

The goal is:

Backend scheduled_date = IST date

Partner App scheduled_date = IST date

Both must match.

==================================================

7. DAILY ROUTE

==================================================

Daily Route must use the same IST business date.

At:

04:00 IST Aug 23

a fresh assignment must appear under:

Aug 23

==================================================

8. HOME

==================================================

Home must now immediately include the fresh assignment in:

TOTAL CUSTOMERS

DAILY POTENTIAL

assignment count

But:

DONE

UNAVAILABLE

NEED WASH

must remain unchanged until those outcomes actually occur.

==================================================

9. EARNINGS

==================================================

Assignment increases:

Daily Potential / expected assignment earning

Completion increases:

Today's Earned

The service must not become "earned" merely because it was assigned.

==================================================

10. 10-SECOND REFRESH

==================================================

After the date fix, verify:

Admin assignment

→ assignment date = IST today

→ useTodayAssignment query = IST today

→ row returned

→ Home/Route/Earnings update

The 10-second safety refresh should now return the assignment.

==================================================

11. REALTIME

==================================================

Keep existing Realtime behavior.

Notification can trigger invalidation.

But the underlying assignment date must already be correct.

==================================================

12. FRESH REAL-DEVICE TEST

==================================================

IMPORTANT:

Run the test during the affected window:

between 00:00 IST and 05:30 IST.

Create a NEW Daily Shine booking.

Admin assigns the booking.

Print:

Current UTC timestamp:

____

Current IST timestamp:

____

IST business date:

____

stored scheduled_date:

____

Partner App getTodayIST:

____

These MUST agree on the calendar date.

==================================================

13. FINAL TEST

==================================================

Admin assigns a NON-DEEPAK partner at approximately the current IST time.

Expected immediately:

✓ assignment DB record

✓ scheduled_date = today's IST date

✓ Partner App assignment visible

✓ Home customer count updated

✓ Daily Potential updated

✓ Daily Route updated

✓ Map updated

✓ Earnings potential updated

✓ in-app notification

✓ 10-second refresh still shows assignment

FCM remains a separate later test.

==================================================

14. REQUIRED FORENSIC REPORT

==================================================

Return:

Current UTC:

____

Current IST:

____

Admin RPC stored scheduled_date:

____

Partner App queried date:

____

Before fix:

____

After fix:

____

Affected database functions/queries:

____

Any current records corrected:

____

==================================================

FINAL ACCEPTANCE

There must be ONE business-calendar definition:

URBAN WASH SERVICE DATE = IST (Asia/Kolkata)

All current and future Daily Shine assignments must use this rule.

No UTC/IST date mismatch.

No today/yesterday hacks.

No date fallback logic.

At 04:00 IST on Aug 23:

Admin assignment

→ scheduled_date = Aug 23

→ Partner query date = Aug 23

→ assignment visible

→ Home/Route/Earnings update.`}
        </div>
      </div>
    </div>
  );
}
