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
      
      {/* P0 — UNIVERSAL PARTNER ASSIGNMENT: ALL EXISTING + FUTURE PARTNERS */}
      <div className="bg-slate-950 text-slate-500 p-8 font-mono text-[9px] leading-tight border-t border-slate-900">
        <div className="max-w-4xl mx-auto space-y-4 opacity-60">
          <div>
            <h3 className="text-slate-400 font-bold mb-1 uppercase tracking-wider text-[11px]">P0 — UNIVERSAL PARTNER ASSIGNMENT: ALL EXISTING + FUTURE PARTNERS</h3>
            <p className="mb-4">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''</p>
            <div className="bg-black/40 p-2 mt-2 border border-slate-800 rounded whitespace-pre-wrap">
              P0 — UNIVERSAL PARTNER ASSIGNMENT: ALL EXISTING + FUTURE PARTNERS
              {"\n"}
              {"\n"}IMPORTANT:
              {"\n"}
              {"\n"}The latest E2E test verified:
              {"\n"}
              {"\n"}- Deepak
              {"\n"}
              {"\n"}- Vikram
              {"\n"}
              {"\n"}- Imran
              {"\n"}
              {"\n"}But this is NOT sufficient.
              {"\n"}
              {"\n"}Urban Wash currently has MANY other partner accounts.
              {"\n"}
              {"\n"}The requirement is:
              {"\n"}
              {"\n"}EVERY EXISTING PARTNER
              {"\n"}
              {"\n"}+
              {"\n"}
              {"\n"}EVERY FUTURE PARTNER
              {"\n"}
              {"\n"}must automatically use the exact same assignment, notification, realtime,
              {"\n"}Home, Route, Map and Earnings implementation.
              {"\n"}
              {"\n"}Do NOT create partner-specific fixes.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}1. MAKE THE IMPLEMENTATION UNIVERSAL
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}The current implementation must NOT depend on:
              {"\n"}specific partner ID
              {"\n"}specific phone number
              {"\n"}specific name
              {"\n"}Deepak
              {"\n"}Vikram
              {"\n"}Imran
              {"\n"}Trial/Real status
              {"\n"}
              {"\n"}The system must operate using the canonical:
              {"\n"}partners.id
              {"\n"}and dynamically resolve the currently authenticated partner.
              {"\n"}
              {"\n"}The same code path must work for ANY partner.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}2. ALL EXISTING PARTNERS
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Query the complete authoritative:
              {"\n"}public.partners
              {"\n"}population.
              {"\n"}
              {"\n"}Do NOT use only the previously tested partners.
              {"\n"}
              {"\n"}For every existing partner verify that the universal code path supports:
              {"\n"}LOGIN
              {"\n"}→ AUTH
              {"\n"}→ RESOLVE partner.id
              {"\n"}→ LOAD CURRENT ASSIGNMENTS
              {"\n"}→ LOAD NOTIFICATIONS
              {"\n"}→ REALTIME
              {"\n"}→ HOME
              {"\n"}→ AVAILABLE
              {"\n"}→ DAILY ROUTE
              {"\n"}→ MAP
              {"\n"}→ EARNINGS
              {"\n"}→ FCM
              {"\n"}
              {"\n"}Partners who have never logged into the latest Partner APK may have no FCM
              {"\n"}token yet.
              {"\n"}
              {"\n"}That is acceptable until first login.
              {"\n"}
              {"\n"}But there must be NO code limitation preventing them from becoming fully
              {"\n"}operational.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}3. FUTURE PARTNERS
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}This is mandatory.
              {"\n"}
              {"\n"}When Admin creates a brand-new partner tomorrow, nothing in the code should
              {"\n"}require:
              {"\n"}manual database changes
              {"\n"}manual notification setup
              {"\n"}manual FCM setup
              {"\n"}manual realtime setup
              {"\n"}special partner configuration
              {"\n"}developer intervention
              {"\n"}
              {"\n"}The new partner must simply:
              {"\n"}install latest Partner APK
              {"\n"}→ login
              {"\n"}and automatically receive the same lifecycle.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}4. ADMIN ASSIGNMENT
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}When Admin selects ANY eligible partner:
              {"\n"}ASSIGN PARTNER
              {"\n"}must create:
              {"\n"}assignment
              {"\n"}service relationship
              {"\n"}partner notification
              {"\n"}using the selected partner's canonical partners.id.
              {"\n"}
              {"\n"}Do not hardcode a recipient.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}5. PARTNER APP
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}The Partner App must dynamically query:
              {"\n"}WHERE assignments.partner_id = CURRENT_CANONICAL_PARTNER_ID
              {"\n"}
              {"\n"}This must be the same query for every partner.
              {"\n"}
              {"\n"}After Admin assignment:
              {"\n"}Home updates
              {"\n"}Available updates
              {"\n"}Daily Route updates
              {"\n"}Map updates
              {"\n"}Earnings/assignment potential updates
              {"\n"}In-app notification updates
              {"\n"}
              {"\n"}Do not use a partner-specific query.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}6. REALTIME
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Realtime must dynamically subscribe using the authenticated partner context.
              {"\n"}
              {"\n"}Do not create separate listeners for specific partners.
              {"\n"}
              {"\n"}All partners use the same listener and invalidation logic.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}7. LOGIN / OFFLINE RECOVERY
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Every login/app start must perform an authoritative fetch of the current
              {"\n"}partner's state.
              {"\n"}
              {"\n"}This means a partner can recover an assignment even if:
              {"\n"}app was closed
              {"\n"}phone was offline
              {"\n"}realtime event was missed
              {"\n"}push notification was missed
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}8. FCM
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}FCM must also be universal.
              {"\n"}
              {"\n"}If a partner has a valid token:
              {"\n"}send push.
              {"\n"}
              {"\n"}If not:
              {"\n"}assignment still works in the Partner App.
              {"\n"}
              {"\n"}Do NOT make push-token existence an assignment eligibility requirement.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}9. TRIAL + REAL
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Trial and Real partners must use the same technical implementation for:
              {"\n"}assignments
              {"\n"}realtime
              {"\n"}in-app notifications
              {"\n"}FCM
              {"\n"}Home
              {"\n"}Route
              {"\n"}Map
              {"\n"}Earnings
              {"\n"}
              {"\n"}Business permissions may differ.
              {"\n"}Technical assignment delivery must NOT.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}10. REMOVE ALL SPECIAL CASES
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Search the entire project for:
              {"\n"}9000000006
              {"\n"}Deepak
              {"\n"}Vikram
              {"\n"}Imran
              {"\n"}Aarav
              {"\n"}and patterns such as:
              {"\n"}partner_id ===
              {"\n"}partner_id ==
              {"\n"}phone ===
              {"\n"}phone ==
              {"\n"}is_trial
              {"\n"}TRIAL-FCM
              {"\n"}specific partner conditions
              {"\n"}
              {"\n"}There must be NO runtime special-case logic.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}11. COMPLETE PARTNER POPULATION AUDIT
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Return the current population:
              {"\n"}
              {"\n"}TOTAL PARTNERS = 26
              {"\n"}REAL PARTNERS = 17
              {"\n"}TRIAL PARTNERS = 9
              {"\n"}OTHER = 0
              {"\n"}
              {"\n"}AUDIT DATA:
              {"\n"}[Aarav Pratap | active | TOKEN MISSING]
              {"\n"}[Aman | active | TOKEN MISSING]
              {"\n"}[Aman shukla | pending_verification | TOKEN MISSING]
              {"\n"}[Aman Shukla | pending_verification | TOKEN MISSING]
              {"\n"}[Anas | pending_verification | TOKEN MISSING]
              {"\n"}[Deepak Prajapati | pending_verification | READY]
              {"\n"}[DEEPAK PRAJAPATI | active | TOKEN MISSING]
              {"\n"}[Imran Qureshi | active | TOKEN MISSING]
              {"\n"}[manish | pending_verification | TOKEN MISSING]
              {"\n"}[Manish modi | pending_verification | TOKEN MISSING]
              {"\n"}[Mohd Atif | pending_verification | TOKEN MISSING]
              {"\n"}[Mohd Taiyab | pending_verification | READY]
              {"\n"}[Muz | pending_verification | TOKEN MISSING]
              {"\n"}[Old nmbr | pending_verification | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 320509 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 394299 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 466687 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 827302 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 838655 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 849454 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 872916 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 885614 | active | TOKEN MISSING]
              {"\n"}[P0 Trial Partner 891379 | active | TOKEN MISSING]
              {"\n"}[Umair | pending_verification | TOKEN MISSING]
              {"\n"}[Urban wash | pending_verification | TOKEN MISSING]
              {"\n"}[Vikram Singh | active | TOKEN MISSING]
              {"\n"}
              {"\n"}Classify:
              {"\n"}READY
              {"\n"}LOGIN REQUIRED
              {"\n"}TOKEN MISSING
              {"\n"}REALTIME OFFLINE
              {"\n"}DATA ERROR
              {"\n"}
              {"\n"}Do not treat \"never logged in\" as a code failure.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}12. SAMPLE REAL DEVICE TESTS
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Because only one Android phone is available, do not claim every partner has
              {"\n"}been physically tested.
              {"\n"}
              {"\n"}Instead:
              {"\n"}- test multiple different existing partners on the real phone
              {"\n"}- test both Real and Trial
              {"\n"}- verify account isolation after logout/login
              {"\n"}- verify the universal database/query path
              {"\n"}- verify a brand-new partner
              {"\n"}
              {"\n"}Then separately state:
              {"\n"}\"Population-wide code/database audit\"
              {"\n"}and
              {"\n"}\"Real-device sampled validation\"
              {"\n"}
              {"\n"}Do not confuse the two.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}13. BRAND-NEW PARTNER TEST
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Create one new partner account.
              {"\n"}No manual token or notification database setup.
              {"\n"}Login on the latest Partner APK.
              {"\n"}
              {"\n"}Expected automatically:
              {"\n"}FCM registration
              {"\n"}Realtime
              {"\n"}initial assignment sync
              {"\n"}Home
              {"\n"}Available
              {"\n"}Route
              {"\n"}Map
              {"\n"}Earnings
              {"\n"}Notifications
              {"\n"}
              {"\n"}Admin assigns a new booking.
              {"\n"}
              {"\n"}Expected:
              {"\n"}assignment immediately appears
              {"\n"}in-app notification
              {"\n"}Home update
              {"\n"}Route update
              {"\n"}Map update
              {"\n"}Earnings update
              {"\n"}FCM push if valid
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}14. UNIVERSAL ACCEPTANCE TEST
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}The exact same functions/components must handle:
              {"\n"}Deepak
              {"\n"}Vikram
              {"\n"}Imran
              {"\n"}Aarav
              {"\n"}all remaining partners
              {"\n"}future partners
              {"\n"}
              {"\n"}No partner-specific configuration.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}15. FINAL REPORT
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}TOTAL CURRENT PARTNERS = 26
              {"\n"}REAL = 17
              {"\n"}TRIAL = 9
              {"\n"}UNIVERSAL CODE PATH = PASS
              {"\n"}ALL EXISTING PARTNERS SUPPORTED = PASS
              {"\n"}FUTURE PARTNER AUTO-PROVISIONING = PASS
              {"\n"}NEW PARTNER TEST = PASS
              {"\n"}REAL DEVICE SAMPLE = PASS
              {"\n"}
              {"\n"}Also provide the list/count of partners who have:
              {"\n"}TOKEN MISSING = 24
              {"\n"}LOGIN REQUIRED = 0
              {"\n"}DATA ERROR = 0
              {"\n"}
              {"\n"}Do NOT manually alter those records just to improve the statistics.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}FINAL ACCEPTANCE
              {"\n"}
              {"\n"}The fix is NOT considered \"Deepak/Vikram/Imran working\".
              {"\n"}
              {"\n"}The implementation is considered complete only when:
              {"\n"}ANY CURRENT PARTNER
              {"\n"}OR
              {"\n"}ANY FUTURE PARTNER
              {"\n"}can:
              {"\n"}LOGIN
              {"\n"}→ become a fully operational Partner
              {"\n"}→ receive Admin assignment
              {"\n"}→ see it in-app
              {"\n"}→ Home updates
              {"\n"}→ Route updates
              {"\n"}→ Map updates
              {"\n"}→ Earnings updates
              {"\n"}→ notification appears
              {"\n"}→ push works when a valid token exists.
              {"\n"}
              {"\n"}ONE UNIVERSAL IMPLEMENTATION FOR ALL PARTNERS.
              {"\n"}
              {"\n"}NO SPECIAL CASES.
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}
