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
      
      {/* P0 — SINGLE ANDROID DEVICE MULTI-PARTNER TESTING */}
      <div className="bg-slate-950 text-slate-500 p-8 font-mono text-[9px] leading-tight border-t border-slate-900">
        <div className="max-w-4xl mx-auto space-y-4 opacity-60">
          <div>
            <h3 className="text-slate-400 font-bold mb-1 uppercase tracking-wider">P0 — SINGLE ANDROID DEVICE MULTI-PARTNER TESTING</h3>
            <p>'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''</p>
            <div className="bg-black/40 p-2 mt-2 border border-slate-800 rounded whitespace-pre-wrap">
              P0 — SINGLE ANDROID DEVICE MULTI-PARTNER TESTING

              IMPORTANT TESTING CONTEXT:
              I currently have ONLY ONE Android phone.
              I am testing multiple Partner accounts on the same physical device by:
              Login Partner A -> logout -> login Partner B -> logout -> login Partner C etc.
              This MUST NOT create backend/account contamination.
              The application must correctly isolate each partner account even when the same physical Android device is reused.

              ==================================================
              1. ACCOUNT SWITCH CLEANUP
              ==================================================
              Every logout/login transition must correctly handle:
              Supabase auth session, current partner identity, TanStack Query cache, Partner realtime subscriptions, FCM token/account association, local notification state, assignment state.
              When Partner A logs out: clear Partner A-specific cached data.
              When Partner B logs in: Partner B must start with Partner B's own authoritative state.

              ==================================================
              2. FCM TOKEN HANDLING
              ==================================================
              The same physical device may have one FCM token at a time.
              DO NOT assume: one device = one permanent partner.
              When switching accounts: verify how the current FCM token is associated with the logged-in partner.
              The backend must NOT send a notification to the wrong partner because the device token was previously associated with another account.
              Use the canonical partner/account identity.

              ==================================================
              3. REALTIME SESSION CLEANUP
              ==================================================
              When Partner A logs out: unsubscribe Partner A's realtime channels.
              When Partner B logs in: create Partner B's realtime subscriptions.
              There must never be a situation where Partner A realtime listener + Partner B realtime listener are both active on the same logged-in app session.

              ==================================================
              4. QUERY CACHE ISOLATION
              ==================================================
              After logout: clear Partner A assignment/route/notification/earnings cache.
              After Partner B login: fetch Partner B's authoritative state from the database.

              ==================================================
              5. SINGLE-DEVICE E2E TEST
              ==================================================
              Use ONE phone.
              TEST A: Login Deepak -> verify identity -> verify assignment -> Admin assigns booking -> verify Deepak state. Logout completely.
              TEST B: Login Vikram -> verify identity -> verify no Deepak state remains -> Admin assigns NEW booking to Vikram -> verify Vikram state. Logout completely.

              ==================================================
              6. PUSH TEST INTERPRETATION
              ==================================================
              Do NOT treat "push did not appear" as definitive proof of backend broadcast failure unless the current account's FCM token and Firebase response are verified.

              ==================================================
              7. DATABASE ASSIGNMENT TEST
              ==================================================
              Admin assigns: Deepak, Vikram, Imran, Aarav. Each must create correct assignment/notification. No account should affect another.

              ==================================================
              8. FUTURE PARTNERS
              ==================================================
              The same account-isolation behavior must work for every future Partner account using the same device or another device.

              FINAL ACCEPTANCE:
              Logging in as one partner must NEVER cause another partner's assignment, notifications, route, earnings or realtime state to appear.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
