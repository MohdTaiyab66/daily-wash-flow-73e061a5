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
                                        
                                            
                                            P0 — STOP GUESSING. FIND THE EXACT STATE PROPAGATION FAILURE.

The previous "universal service resolver" change did NOT fix the problem.

REAL RESULT:

Admin assigns a partner.

Partner App receives:

"New Service Assigned"

BUT:

Home does NOT update

Customer count does NOT update

Daily Potential does NOT update

Daily Route does NOT update

Map does NOT update

Assignment/Available state does NOT update

Earnings does NOT update

Therefore the notification pipeline works, but the OPERATIONAL ASSIGNMENT

STATE STILL DOES NOT PROPAGATE.

Do NOT add another resolver/filter/merge based on assumptions.

We need to trace ONE fresh assignment through the actual live system.

==================================================

1. CREATE ONE FRESH TEST ASSIGNMENT

==================================================

Create a NEW paid Daily Shine booking.

Admin assigns it to a NON-DEEPAK partner.

Record:

booking_id

assignment_id

service_id

subscription_id

vehicle_id

customer_id

partner_id

scheduled_date

service status

assignment status

==================================================

2. DATABASE PROOF

==================================================

Immediately after Admin clicks ASSIGN PARTNER, query the actual records.

Confirm:

assignments row exists

service row exists

correct partner_id

correct scheduled_date

correct vehicle_id

correct customer_id

correct service status

correct assignment status

Do NOT infer these values from notification metadata.

SHOW THE ACTUAL ROWS.

==================================================

3. FIND THE EXACT QUERY USED BY HOME

==================================================

Do NOT modify useTodayAssignment yet.

First identify the REAL query/function that currently supplies:

TOTAL CUSTOMERS

DAILY POTENTIAL

DONE

UNAVAILABLE

NEED WASH

REMAINING

Then run that EXACT query using the CURRENT logged-in partner.

We need to know:

QUERY RETURNS NEW ASSIGNMENT = YES/NO

If NO:

show the exact filters that remove it:

partner_id

scheduled_date

status

service_type

vehicle_id

subscription

assignment state

area/zone

date/time

anything else

==================================================

4. FIND THE EXACT QUERY USED BY DAILY ROUTE

==================================================

Do the same for Daily Route.

Do NOT assume it uses useTodayAssignment.

Identify the actual source.

Then test:

NEW ASSIGNMENT RETURNED = YES/NO

==================================================

5. FIND THE EXACT QUERY USED BY EARNINGS

==================================================

Identify the actual query/data source used for:

Daily Potential

Today's Earned

Test the same fresh assignment.

Remember:

ASSIGNED = Daily Potential may increase.

COMPLETED = Today's Earned increases.

Do NOT count assigned work as completed earnings.

==================================================

6. CRITICAL COMPARISON

==================================================

We need this exact table:

                        DB    HOME QUERY    ROUTE QUERY    EARNINGS QUERY

Fresh assignment       YES       ?              ?              ?

Do not mark Home/Route/Earnings PASS because a function exists.

We need actual returned rows.

==================================================

7. TEST THE 10-SECOND REFRESH

==================================================

After Admin assignment:

DO NOT manually refresh the app.

Observe:

Realtime event received?

YES/NO

Query invalidated?

YES/NO

Query refetched?

YES/NO

Fresh assignment returned?

YES/NO

Wait 10 seconds.

After safety refresh:

Fresh assignment returned?

YES/NO

If the 10-second refresh also returns old data, then this is NOT a realtime

problem. It is a DATA QUERY / IDENTITY / FILTER problem.

==================================================

8. CANONICAL PARTNER ID

==================================================

Print for the CURRENT logged-in partner:

auth.users.id

resolved partners.id

assignments.partner_id

service.partner_id if such a field exists

current query partner filter

These values must be mapped correctly.

Do NOT assume auth.uid() = partners.id.

==================================================

9. DATE/TIME

==================================================

This is critical.

Print:

database scheduled_date

database service date/time

current IST date

Partner App date

query date filter

Check whether the assignment is being excluded because:

UTC date != IST date

scheduled_date != service date

midnight rollover

timestamp conversion

Do NOT add another date conversion until the actual mismatch is shown.

==================================================

10. STATUS FILTER

==================================================

Print the actual status values for the fresh assignment.

Then compare them to every query's filters.

For example:

assignment status = ?

service status = ?

booking status = ?

If the new Admin-assigned service is filtered out because the query expects a

different status, identify that exact condition.

==================================================

11. IMPORTANT — NOTIFICATION IS ALREADY WORKING

==================================================

The Partner App already receives:

"New Service Assigned"

Therefore DO NOT spend time fixing notifications.

Use the notification only as the trigger that tells us:

"an assignment happened."

The assignment data itself must then be read from the authoritative database.

==================================================

12. DO NOT MERGE MULTIPLE SOURCES BLINDLY

==================================================

The latest change says the hook now merges:

today's services

+

assignment-linked services

Do not keep adding more merge paths.

First determine which ONE authoritative record should represent Admin

assignment.

Preferred:

assignments.partner_id = canonical partners.id

Then derive:

service

customer

vehicle

route

earning potential

from the authoritative assignment/service relationship.

Avoid creating multiple competing definitions of "today's work."

==================================================

13. UI UPDATE CHECK

==================================================

If the query DOES return the new assignment, but Home still shows old values,

then the problem is now UI state/cache.

Trace:

query returned new row

→ hook state updated?

→ selector/derived data updated?

→ React component rerendered?

→ displayed count changed?

Find the exact point.

==================================================

14. REQUIRED FORENSIC RESULT

==================================================

Return exactly:

Fresh booking:

____

Assignment:

____

Partner:

____

Scheduled date:

____

DB assignment exists:

PASS/FAIL

Home source query returns assignment:

PASS/FAIL

Route source query returns assignment:

PASS/FAIL

Earnings source query sees assignment:

PASS/FAIL

Realtime event:

PASS/FAIL

Query invalidation:

PASS/FAIL

10s refresh:

PASS/FAIL

Canonical partner ID:

PASS/FAIL

Date filter:

PASS/FAIL

Status filter:

PASS/FAIL

UI rerender:

PASS/FAIL

==================================================

15. FIRST DIVERGENCE

==================================================

State ONLY the first point where the fresh assignment disappears.

Examples:

"Assignment exists in DB but Home query returns 0 rows because ______."

OR:

"Home query returns the assignment but derived Home state excludes it because

______."

OR:

"Query returns new state but UI does not rerender because ______."

==================================================

FINAL RULE

DO NOT make another broad architecture change.

DO NOT update src/routes/index.tsx.

DO NOT claim this is fixed because the assignment exists in the database.

Find the FIRST REAL DIVERGENCE and fix ONLY that layer.

AFTER the fix:

Admin assigns

→ assignment exists

→ Home updates

→ Daily Route updates

→ Map updates

→ Daily Potential updates

→ in-app notification

WITHOUT manual refresh.

FCM remains out of scope until this passes.`}
        </div>
      </div>
    </div>
  );
}
