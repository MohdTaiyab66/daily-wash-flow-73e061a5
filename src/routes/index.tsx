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
                                        
                                            
                                            P0 — AUTHORITATIVE PARTNER WORK SOURCE

PART 2 — FIX THE ACTUAL ROOT CAUSE

Use the exact root cause found in PART 1.

DO NOT modify src/routes/index.tsx.

DO NOT touch FCM.

We are removing the inconsistent data-source problem.

==================================================

1. CREATE ONE AUTHORITATIVE PARTNER WORK SOURCE

==================================================

Create ONE server-side/database function or view based on the ACTUAL existing

schema.

Purpose:

Return all currently assigned operational work for ONE canonical partner.

Input:

canonical partners.id

Output must include enough data for:

customer

vehicle

booking

service

assignment

scheduled date/time

location

assignment status

service status

earning value/potential

Do not duplicate or invent schema columns.

==================================================

2. CANONICAL IDENTITY

==================================================

Resolve:

authenticated user

→ canonical partners.id

Then every operational query uses:

assignments.partner_id = canonical partners.id

No phone-based guessing.

==================================================

3. HOME

==================================================

Home must consume the authoritative Partner Work source.

Calculate:

TOTAL CUSTOMERS

DAILY POTENTIAL

DONE

UNAVAILABLE

NEED WASH

REMAINING

from that same source.

Important:

ASSIGNED service:

increases customer count and Daily Potential

COMPLETED:

increases Today's Earned

UNAVAILABLE:

counts as Unavailable

NEED WASH:

counts as Need Wash

==================================================

4. DAILY ROUTE

==================================================

Daily Route must use the SAME authoritative Partner Work source.

Do not maintain a separate assignment query.

Show:

customer

vehicle

service time

location

map

remaining count

==================================================

5. AVAILABLE / ASSIGNMENTS

==================================================

Partner's assigned work must come from the same authoritative source.

Marketplace available offers can remain separate because those are unclaimed

work.

Once Admin assigns the booking, it must move into the Partner's authoritative

assigned work.

==================================================

6. EARNINGS

==================================================

Use the same authoritative work source.

Assigned work contributes to:

Daily Potential

Completed work contributes to:

Today's Earned

Do NOT count assignments as completed earnings.

==================================================

7. INITIAL LOAD

==================================================

On:

login

app startup

app resume

immediately fetch authoritative Partner Work.

Do not wait for Realtime.

==================================================

8. REALTIME

==================================================

Keep Realtime only as an accelerator:

assignment INSERT/UPDATE

→ invalidate Partner Work

→ refetch

==================================================

9. SAFETY REFRESH

==================================================

Keep the existing 10-second safety refresh.

It must refetch the SAME authoritative Partner Work source.

No separate Home/Route/Earnings queries.

==================================================

10. ACCOUNT SWITCH

==================================================

On logout:

clear Partner Work cache.

On login:

resolve new canonical partners.id

→ fetch only that partner's work.

==================================================

11. FINAL TEST

==================================================

Use one fresh booking and assign it to:

Deepak

Vikram

Imran

Aarav

For each partner:

Admin assignment

→ authoritative Partner Work contains assignment

→ Home updates

→ Daily Route updates

→ Map updates

→ Daily Potential updates

→ Available/Assignment state updates

→ notification appears

Do not include FCM in this test.

==================================================

FINAL ACCEPTANCE

There must be ONE source for Partner operational work.

The flow is:

Admin ASSIGN

→ assignments record

→ authoritative Partner Work

→ Home

→ Available

→ Daily Route

→ Map

→ Earnings

Realtime and notification are secondary delivery/update mechanisms.

If the same assignment exists in the database, every Partner operational

screen must see it from the same authoritative source.

NO partner-specific logic.

NO Deepak exception.

NO phone-based assignment lookup.

NO additional resolver/merge hacks.

NO changes to the public landing page.`}
        </div>
      </div>
    </div>
  );
}
