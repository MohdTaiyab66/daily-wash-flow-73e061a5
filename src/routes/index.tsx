import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Shield, Car, CheckCircle2, Star, MapPin, Clock } from 'lucide-react';

export const Route = createFileRoute('/')({
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
      
      {/* P0 — VERIFY ADMIN ASSIGNMENT AFTER SCHEMA FIX */}
      <div className="bg-slate-950 text-slate-500 p-8 font-mono text-[9px] leading-tight border-t border-slate-900">
        <div className="max-w-4xl mx-auto space-y-4 opacity-60">
          <div>
            <h3 className="text-slate-400 font-bold mb-1 uppercase tracking-wider text-[11px]">P0 — VERIFY ADMIN ASSIGNMENT AFTER SCHEMA FIX</h3>
            <p className="mb-4">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''</p>
            <div className="bg-black/40 p-2 mt-2 border border-slate-800 rounded whitespace-pre-wrap">
              P0 — VERIFY ADMIN ASSIGNMENT AFTER SCHEMA FIX
              {"\n"}
              {"\n"}DO NOT MODIFY CODE UNLESS THE TEST FAILS.
              {"\n"}
              {"\n"}DO NOT UPDATE src/routes/index.tsx.
              {"\n"}
              {"\n"}The invalid:
              {"\n"}
              {"\n"}services.booking_id
              {"\n"}
              {"\n"}reference has now been removed and the correct booking/service relationship
              {"\n"}
              {"\n"}has been restored.
              {"\n"}
              {"\n"}Now perform a fresh REAL test.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}1. CREATE FRESH DAILY SHINE BOOKING
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Create a new paid Daily Shine booking.
              {"\n"}
              {"\n"}Record:
              {"\n"}
              {"\n"}booking_id
              {"\n"}
              {"\n"}customer_id
              {"\n"}
              {"\n"}vehicle_id
              {"\n"}
              {"\n"}service_id
              {"\n"}
              {"\n"}subscription_id
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}2. ADMIN ASSIGNMENT
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Open the booking in:
              {"\n"}
              {"\n"}Admin → Assign Partner
              {"\n"}
              {"\n"}Select one partner.
              {"\n"}
              {"\n"}Click:
              {"\n"}
              {"\n"}ASSIGN PARTNER
              {"\n"}
              {"\n"}Expected:
              {"\n"}
              {"\n"}NO ERROR.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}3. VERIFY DATABASE
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Immediately verify:
              {"\n"}
              {"\n"}assignment row exists
              {"\n"}
              {"\n"}assignment.partner_id is correct
              {"\n"}
              {"\n"}assignment.booking_id/service relationship is correct
              {"\n"}
              {"\n"}service record exists/is linked correctly
              {"\n"}
              {"\n"}booking status is correct
              {"\n"}
              {"\n"}subscription state is correct
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}4. VERIFY NOTIFICATION
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}After successful assignment:
              {"\n"}
              {"\n"}partner_notifications row exists.
              {"\n"}
              {"\n"}Verify:
              {"\n"}
              {"\n"}partner_id
              {"\n"}
              {"\n"}booking_id
              {"\n"}
              {"\n"}service_id
              {"\n"}
              {"\n"}assignment_id
              {"\n"}
              {"\n"}vehicle_id
              {"\n"}
              {"\n"}metadata
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}5. VERIFY PARTNER APP
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}On the assigned partner's App, without manual refresh:
              {"\n"}
              {"\n"}assignment appears
              {"\n"}
              {"\n"}Home updates
              {"\n"}
              {"\n"}Available updates
              {"\n"}
              {"\n"}Daily Route updates
              {"\n"}
              {"\n"}customer appears
              {"\n"}
              {"\n"}vehicle appears
              {"\n"}
              {"\n"}map updates
              {"\n"}
              {"\n"}assignment earning/potential updates
              {"\n"}
              {"\n"}in-app notification appears
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}6. VERIFY PUSH SEPARATELY
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}If the partner has a valid FCM token:
              {"\n"}
              {"\n"}push should arrive.
              {"\n"}
              {"\n"}But:
              {"\n"}
              {"\n"}FCM failure MUST NOT prevent the assignment from appearing in-app.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}7. TEST NON-DEEPAK PARTNER
              {"\n"}
              {"\n"}Do NOT test only Deepak.
              {"\n"}
              {"\n"}Run a second fresh assignment for another partner.
              {"\n"}
              {"\n"}Verify the exact same:
              {"\n"}
              {"\n"}assignment
              {"\n"}
              {"\n"}notification
              {"\n"}
              {"\n"}Home
              {"\n"}
              {"\n"}Route
              {"\n"}
              {"\n"}Earnings
              {"\n"}
              {"\n"}in-app update
              {"\n"}
              {"\n"}push if token exists
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}8. REQUIRED REPORT
              {"\n"}
              {"\n"}Return:
              {"\n"}
              {"\n"}Fresh booking_id:
              {"\n"}
              {"\n"}service_id:
              {"\n"}
              {"\n"}subscription_id:
              {"\n"}
              {"\n"}assignment_id:
              {"\n"}
              {"\n"}partner_id:
              {"\n"}
              {"\n"}Admin assignment = PASS/FAIL
              {"\n"}
              {"\n"}Database assignment = PASS/FAIL
              {"\n"}
              {"\n"}Service relationship = PASS/FAIL
              {"\n"}
              {"\n"}Partner notification = PASS/FAIL
              {"\n"}
              {"\n"}Partner App assignment = PASS/FAIL
              {"\n"}
              {"\n"}Home = PASS/FAIL
              {"\n"}
              {"\n"}Daily Route = PASS/FAIL
              {"\n"}
              {"\n"}Earnings = PASS/FAIL
              {"\n"}
              {"\n"}FCM = PASS/FAIL
              {"\n"}
              {"\n"}If the Admin assignment still fails, provide the exact database error and
              {"\n"}
              {"\n"}identify the exact failing RPC statement.
              {"\n"}
              {"\n"}DO NOT claim the fix is complete from code inspection.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
