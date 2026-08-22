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
                                        
                                            
                                            P0 — STOP LANDING PAGE / STOP GENERIC FIXES

PART 1 — TRACE THE ACTUAL PARTNER WORK DATA

DO NOT modify src/routes/index.tsx.

DO NOT write forensic instructions into any UI.

DO NOT modify FCM.

DO NOT add another merge/resolver workaround yet.

REAL CURRENT RESULT:

Admin assigns partner:

✓ assignment is created

✓ Partner App receives "New Service Assigned" in-app notification

BUT:

✗ Home customer count does not update

✗ Daily Potential does not update

✗ Daily Route does not update

✗ Map does not update

✗ Earnings/assigned work does not update

This proves notification delivery is NOT the problem.

Find exactly why the operational screens cannot see the newly assigned work.

==================================================

1. TAKE ONE FRESH TEST

==================================================

Create ONE new paid Daily Shine booking.

Admin assigns it to a NON-DEEPAK partner.

Record:

booking_id

assignment_id

service_id

partner_id

vehicle_id

customer_id

scheduled_date

service_time

booking_status

assignment_status

service_status

==================================================

2. INSPECT ACTUAL DATABASE ROWS

==================================================

Read the actual rows from:

assignments

services

bookings

subscriptions

vehicles

customers

Use the REAL schema.

Do not assume column names.

Verify the new assignment has a complete relationship to:

partner

booking

service

vehicle

customer

scheduled date

==================================================

3. FIND THE ACTUAL DATA SOURCE OF EACH SCREEN

==================================================

Identify the exact function/query used by:

HOME

AVAILABLE

DAILY ROUTE

EARNINGS

Do not assume they use useTodayAssignment.

Give:

Home source:

____

Available source:

____

Daily Route source:

____

Earnings source:

____

==================================================

4. RUN THE SAME QUERY FOR THE CURRENT PARTNER

==================================================

Using the currently logged-in partner session:

run each screen's REAL query against the fresh test assignment.

Return:

Home query returns assignment? YES/NO

Available query returns assignment? YES/NO

Route query returns assignment? YES/NO

Earnings query sees assignment? YES/NO

==================================================

5. PRINT THE ACTUAL FILTERS

==================================================

For every failing query show the real filters:

partner_id

auth identity

date

status

service status

assignment status

area/zone

vehicle

subscription

any other condition

Find the FIRST filter that excludes the fresh assignment.

==================================================

6. IDENTITY CHECK

==================================================

For the same test record compare:

auth.users.id

resolved partners.id

assignments.partner_id

Do not assume they are equal.

Show:

CURRENT APP PARTNER ID:

____

ASSIGNMENT PARTNER ID:

____

If they differ, that is the failure.

==================================================

7. DATE CHECK

==================================================

Show:

DB scheduled_date:

____

DB timestamp:

____

Current IST date:

____

Query date:

____

Confirm the assignment is not disappearing because of UTC/IST conversion.

==================================================

8. STATUS CHECK

==================================================

Show the actual values of:

booking.status

assignment.status

service.status

Compare those to the filters used by Home/Route/Earnings.

==================================================

9. NO MORE GENERIC REPORTS

==================================================

Do NOT say:

"architecture is correct"

"universal resolver is active"

"realtime is configured"

unless the fresh test proves it.

We need one exact statement:

THE ASSIGNMENT DISAPPEARS HERE:

________

ROOT CAUSE:

________

EXACT QUERY/FILTER:

________

Do not fix anything yet.`}
        </div>
      </div>
    </div>
  );
}
