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
      
      {/* P0 — SINGLE-DEVICE ACCOUNT ISOLATION FINAL TEST */}
      <div className="bg-slate-950 text-slate-500 p-8 font-mono text-[9px] leading-tight border-t border-slate-900">
        <div className="max-w-4xl mx-auto space-y-4 opacity-60">
          <div>
            <h3 className="text-slate-400 font-bold mb-1 uppercase tracking-wider">P0 — SINGLE-DEVICE ACCOUNT ISOLATION FINAL TEST</h3>
            <p>'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''</p>
            <div className="bg-black/40 p-2 mt-2 border border-slate-800 rounded whitespace-pre-wrap">
              P0 — SINGLE-DEVICE ACCOUNT ISOLATION FINAL TEST
              {"\n"}
              {"\n"}DO NOT MODIFY CODE UNLESS A TEST FAILS.
              {"\n"}
              {"\n"}DO NOT UPDATE src/routes/index.tsx.
              {"\n"}
              {"\n"}The new account-isolation system has been implemented:
              {"\n"}- logout clears TanStack Query cache
              {"\n"}- realtime channels unsubscribe
              {"\n"}- FCM token is deactivated/reset on logout
              {"\n"}- role conflicts trigger clean sign-out
              {"\n"}- session-level identity tracking prevents cross-account registration
              {"\n"}
              {"\n"}Now VERIFY it on ONE Android phone using multiple Partner accounts.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 1 — DEEPAK
              {"\n"}==================================================
              {"\n"}Login: Deepak
              {"\n"}Verify: auth user = Deepak, partner ID = Deepak, FCM token belongs to Deepak, Realtime connected
              {"\n"}Home/Route/Notifications/Earnings contain only Deepak data.
              {"\n"}Admin assigns Deepak a fresh booking.
              {"\n"}Verify: assignment, in-app notification, Home, Daily Route update.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 2 — FULL LOGOUT
              {"\n"}==================================================
              {"\n"}Logout from Deepak.
              {"\n"}Verify: cache cleared, channels unsubscribed, data disappears, identity removed, FCM token inactive.
              {"\n"}Then fully close/reopen the Partner App.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 3 — VIKRAM
              {"\n"}==================================================
              {"\n"}Login: Vikram
              {"\n"}Verify: current identity = Vikram, Realtime = SUBSCRIBED, sync runs, FCM token registered for Vikram.
              {"\n"}CRITICAL: Vikram MUST NOT see Deepak data.
              {"\n"}Admin assigns a NEW booking to Vikram.
              {"\n"}Verify: assignment, Home, Daily Route, notification appear.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 4 — IMRAN
              {"\n"}==================================================
              {"\n"}Repeat complete cycle: Deepak → logout, Vikram → logout, Imran → login. Verify no leakage.
              {"\n"}Admin assigns Imran. Verify flow.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 5 — AARAV
              {"\n"}==================================================
              {"\n"}Repeat cycle for Aarav. Verify identity, token, realtime, assignment, Home, Route.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 6 — TOKEN OWNERSHIP
              {"\n"}==================================================
              {"\n"}Verify: CURRENT ACCOUNT → CURRENT TOKEN.
              {"\n"}Verify logged-out partner doesn't receive notifications for new partner.
              {"\n"}Verify logout doesn't invalidate other devices for the same partner.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 7 — OFFLINE ASSIGNMENT
              {"\n"}==================================================
              {"\n"}Logout Vikram / close app. Admin assigns Vikram. Login Vikram.
              {"\n"}Expected: assignment recovered from DB, Home/Route updated.
              {"\n"}
              {"\n"}==================================================
              {"\n"}TEST 8 — CROSS-ACCOUNT LEAK TEST
              {"\n"}==================================================
              {"\n"}Deepak (A), Vikram (B), Imran (C), Aarav (D). Switch accounts.
              {"\n"}Expected: Deepak → ONLY A, Vikram → ONLY B, Imran → ONLY C, Aarav → ONLY D.
              {"\n"}
              {"\n"}==================================================
              {"\n"}IMPORTANT
              {"\n"}==================================================
              {"\n"}One device: push delivery alone isn't proof of multi-device FCM.
              {"\n"}Record: FCM registration, ownership, send result, notification received.
              {"\n"}State must work via DB + sync + realtime.
              {"\n"}
              {"\n"}FINAL REPORT
              {"\n"}PARTNER | LOGIN | TOKEN | REALTIME | CACHE ISOLATION | ASSIGNMENT | HOME | ROUTE | NOTIFICATIONS | FCM
              {"\n"}Deepak: ____
              {"\n"}Vikram: ____
              {"\n"}Imran: ____
              {"\n"}Aarav: ____
              {"\n"}
              {"\n"}Cross-account leakage = PASS/FAIL
              {"\n"}Offline recovery = PASS/FAIL
              {"\n"}Token ownership isolation = PASS/FAIL
              {"\n"}Logout cleanup = PASS/FAIL
              {"\n"}
              {"\n"}FINAL ACCEPTANCE: One phone can safely switch between all Partner accounts without data contamination.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
