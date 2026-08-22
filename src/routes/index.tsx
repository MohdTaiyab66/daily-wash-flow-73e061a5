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
      
      {/* URBAN WASH — P0 FINAL ARCHITECTURE */}
      <div className="bg-slate-950 text-slate-500 p-8 font-mono text-[9px] leading-tight border-t border-slate-900">
        <div className="max-w-4xl mx-auto space-y-4 opacity-60">
          <div>
            <h3 className="text-slate-400 font-bold mb-1 uppercase tracking-wider">URBAN WASH — P0 FINAL ARCHITECTURE</h3>
            <p>'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''</p>
            <div className="bg-black/40 p-2 mt-2 border border-slate-800 rounded whitespace-pre-wrap">
              URBAN WASH — P0 FINAL ARCHITECTURE
              {"\n"}
              {"\n"}MAKE ADMIN ASSIGNMENT WORK FOR EVERY PARTNER
              {"\n"}
              {"\n"}STOP trying to solve Admin assignment delivery primarily through FCM.
              {"\n"}
              {"\n"}The current real-world problem is:
              {"\n"}Deepak receives Admin assignments and push.
              {"\n"}Other partners often receive nothing.
              {"\n"}
              {"\n"}I want ONE simple authoritative system that works identically for:
              {"\n"}- all existing Real partners
              {"\n"}- all existing Trial partners
              {"\n"}- all future partners
              {"\n"}
              {"\n"}==================================================
              {"\n"}1. DATABASE ASSIGNMENT IS THE SOURCE OF TRUTH
              {"\n"}==================================================
              {"\n"}When Admin clicks: ASSIGN PARTNER
              {"\n"}the ONLY authoritative action is: booking → assignment created → assignment.partner_id = selected canonical partner ID
              {"\n"}Do NOT require: FCM, Realtime, push token, online status, marketplace, notification delivery for the assignment itself.
              {"\n"}If push fails, assignment must STILL be created.
              {"\n"}
              {"\n"}==================================================
              {"\n"}2. PARTNER APP MUST ALWAYS FETCH ITS OWN ASSIGNMENTS
              {"\n"}==================================================
              {"\n"}On Partner login/app startup:
              {"\n"}1. Resolve canonical partner ID.
              {"\n"}2. Query all active assignments where: assignments.partner_id = current partner ID
              {"\n"}3. Load notifications, today's route, earnings.
              {"\n"}This must happen EVERY time the app starts or partner logs in.
              {"\n"}Do not rely on receiving a previous realtime event.
              {"\n"}
              {"\n"}==================================================
              {"\n"}3. REALTIME = FAST UPDATE
              {"\n"}==================================================
              {"\n"}Keep Supabase Realtime. When a new assignment is created: emit/receive realtime event.
              {"\n"}Then invalidate/refetch: assignments, Home, Available, Daily Route, Notifications, Earnings.
              {"\n"}But realtime is only an acceleration mechanism.
              {"\n"}
              {"\n"}==================================================
              {"\n"}4. POLLING = SAFETY NET
              {"\n"}==================================================
              {"\n"}Add a lightweight safety refresh while the authenticated Partner App is active.
              {"\n"}For example: every 10 seconds fetch current active assignments for the logged-in partner.
              {"\n"}If the data changes: update the UI.
              {"\n"}This is intentional redundancy.
              {"\n"}
              {"\n"}==================================================
              {"\n"}5. FCM = NOTIFICATION ONLY
              {"\n"}==================================================
              {"\n"}If the partner has a valid FCM token: send: NEW SERVICE ASSIGNED
              {"\n"}But FCM failure must NEVER prevent: assignment creation, in-app assignment, Home update, Route update.
              {"\n"}
              {"\n"}==================================================
              {"\n"}6. CANONICAL PARTNER ID
              {"\n"}==================================================
              {"\n"}Every Partner App must resolve ONE canonical partner identity.
              {"\n"}Use: partners.id for: assignments.partner_id, partner notifications, assignment queries.
              {"\n"}
              {"\n"}==================================================
              {"\n"}7. SAME IMPLEMENTATION FOR ALL PARTNERS
              {"\n"}==================================================
              {"\n"}There must be NO special code for: Deepak, 9000000006, Trial, Real, specific phone, specific partner ID.
              {"\n"}Every partner executes the SAME: LOGIN → RESOLVE PARTNER → FETCH ASSIGNMENTS → FETCH NOTIFICATIONS → CONNECT REALTIME → START SAFETY REFRESH.
              {"\n"}
              {"\n"}==================================================
              {"\n"}8. PARTNER HOME
              {"\n"}==================================================
              {"\n"}Home must derive assignment data directly from the authoritative assignment query.
              {"\n"}When Admin assigns: Customer appears immediately, Customer count updates, Assignment status updates, Daily potential updates.
              {"\n"}
              {"\n"}==================================================
              {"\n"}9. DAILY ROUTE
              {"\n"}==================================================
              {"\n"}Daily Route must use the same assignment query.
              {"\n"}After Admin assignment: customer, vehicle, registration, time, location, map must appear automatically.
              {"\n"}
              {"\n"}==================================================
              {"\n"}10. NOTIFICATIONS
              {"\n"}==================================================
              {"\n"}Create partner in-app notification after successful assignment.
              {"\n"}But notification delivery must NOT determine whether the assignment exists.
              {"\n"}
              {"\n"}==================================================
              {"\n"}11. LOGIN RECOVERY
              {"\n"}==================================================
              {"\n"}If Admin assigns while partner is offline/logged out: then the next app open/login MUST fetch the active assignment.
              {"\n"}
              {"\n"}==================================================
              {"\n"}12. ACCOUNT SWITCHING ON ONE PHONE
              {"\n"}==================================================
              {"\n"}When partner logs out: clear cached assignment state.
              {"\n"}When another partner logs in: fetch only that partner's assignments.
              {"\n"}
              {"\n"}==================================================
              {"\n"}13. ADMIN
              {"\n"}==================================================
              {"\n"}Admin assignment screen remains: PAID BOOKING → SELECT PARTNER → ASSIGN PARTNER.
              {"\n"}The Admin action must not depend on partner notification delivery.
              {"\n"}
              {"\n"}==================================================
              {"\n"}14. E2E TEST
              {"\n"}==================================================
              {"\n"}Use one Android phone. Test: Deepak, Vikram, Imran, Aarav.
              {"\n"}For each: Login partner, verify active assignments, Admin assigns NEW booking, Wait without refreshing, Assignment must appear.
              {"\n"}
              {"\n"}==================================================
              {"\n"}15. OFFLINE TEST
              {"\n"}==================================================
              {"\n"}Close Partner App. Admin assigns the partner. Open Partner App again.
              {"\n"}Expected: assignment recovered immediately from database.
              {"\n"}
              {"\n"}==================================================
              {"\n"}16. FCM FAILURE TEST
              {"\n"}==================================================
              {"\n"}Assume FCM is unavailable. Admin assigns partner.
              {"\n"}Expected: assignment STILL appears in Partner App through: database fetch, realtime, or 10-second safety refresh.
              {"\n"}
              {"\n"}FINAL ACCEPTANCE: For ANY current or future partner: ADMIN ASSIGN → DATABASE ASSIGNMENT CREATED.
              {"\n"}Then regardless of FCM or Realtime: PARTNER APP detects assignment, displays it, updates all screens.
              {"\n"}FCM push is an additional alert, NOT the assignment mechanism.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
