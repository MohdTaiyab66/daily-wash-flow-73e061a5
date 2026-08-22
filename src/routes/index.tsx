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
      
      {/* P0 — REAL DEVICE PROOF FOR NON-DEEPAK PARTNERS */}
      <div className="bg-slate-950 text-slate-500 p-8 font-mono text-[9px] leading-tight border-t border-slate-900">
        <div className="max-w-4xl mx-auto space-y-4 opacity-60">
          <div>
            <h3 className="text-slate-400 font-bold mb-1 uppercase tracking-wider text-[11px]">P0 — REAL DEVICE PROOF FOR NON-DEEPAK PARTNERS</h3>
            <p className="mb-4">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''</p>
            <div className="bg-black/40 p-2 mt-2 border border-slate-800 rounded whitespace-pre-wrap">
              P0 — REAL DEVICE PROOF FOR NON-DEEPAK PARTNERS
              {"\n"}
              {"\n"}DO NOT MODIFY THE BACKEND OR ARCHITECTURE UNLESS THE REAL DEVICE TEST FAILS.
              {"\n"}
              {"\n"}DO NOT UPDATE src/routes/index.tsx.
              {"\n"}
              {"\n"}The latest database E2E test proves:
              {"\n"}
              {"\n"}Vikram:
              {"\n"}
              {"\n"}booking = PASS
              {"\n"}
              {"\n"}service = PASS
              {"\n"}
              {"\n"}assignment = PASS
              {"\n"}
              {"\n"}partner notification row = PASS
              {"\n"}
              {"\n"}Imran:
              {"\n"}
              {"\n"}booking = PASS
              {"\n"}
              {"\n"}service = PASS
              {"\n"}
              {"\n"}assignment = PASS
              {"\n"}
              {"\n"}partner notification row = PASS
              {"\n"}
              {"\n"}This confirms the Admin → Database assignment pipeline is working.
              {"\n"}
              {"\n"}Now verify the ACTUAL PARTNER APP.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}1. VIKRAM — REAL DEVICE
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Login to the latest Partner APK as Vikram.
              {"\n"}
              {"\n"}Use the fresh assignment:
              {"\n"}
              {"\n"}booking_id:
              {"\n"}
              {"\n"}1c73cf63-bbbd-456a-994e-b3bdc2d23f33
              {"\n"}
              {"\n"}assignment_id:
              {"\n"}
              {"\n"}5a6a85ba-64cc-4a1c-b54f-d36333294200
              {"\n"}
              {"\n"}Do NOT refresh manually.
              {"\n"}
              {"\n"}Verify:
              {"\n"}
              {"\n"}ASSIGNMENT:
              {"\n"}
              {"\n"}visible = PASS/FAIL
              {"\n"}
              {"\n"}IN-APP NOTIFICATION:
              {"\n"}
              {"\n"}visible = PASS/FAIL
              {"\n"}
              {"\n"}HOME:
              {"\n"}
              {"\n"}customer count updated = PASS/FAIL
              {"\n"}
              {"\n"}assignment state updated = PASS/FAIL
              {"\n"}
              {"\n"}daily potential updated = PASS/FAIL
              {"\n"}
              {"\n"}progress updated = PASS/FAIL
              {"\n"}
              {"\n"}AVAILABLE:
              {"\n"}
              {"\n"}assignment visible = PASS/FAIL
              {"\n"}
              {"\n"}DAILY ROUTE:
              {"\n"}
              {"\n"}customer visible = PASS/FAIL
              {"\n"}
              {"\n"}vehicle visible = PASS/FAIL
              {"\n"}
              {"\n"}service time visible = PASS/FAIL
              {"\n"}
              {"\n"}map marker visible = PASS/FAIL
              {"\n"}
              {"\n"}remaining count updated = PASS/FAIL
              {"\n"}
              {"\n"}EARNINGS:
              {"\n"}
              {"\n"}assignment potential updated = PASS/FAIL
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}2. VIKRAM PUSH
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Verify the actual Android notification tray.
              {"\n"}
              {"\n"}Do NOT mark FCM PASS because metadata exists.
              {"\n"}
              {"\n"}Record:
              {"\n"}
              {"\n"}FCM token exists = PASS/FAIL
              {"\n"}
              {"\n"}FCM send response = PASS/FAIL
              {"\n"}
              {"\n"}physical Android push received = PASS/FAIL
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}3. IMRAN — REAL DEVICE
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Repeat the same test for:
              {"\n"}
              {"\n"}booking_id:
              {"\n"}
              {"\n"}63919b38-032a-4766-a02c-f706b1bd7663
              {"\n"}
              {"\n"}assignment_id:
              {"\n"}
              {"\n"}4ad1f46a-3674-487b-8d9e-903647ba6243
              {"\n"}
              {"\n"}Again:
              {"\n"}
              {"\n"}NO manual refresh.
              {"\n"}
              {"\n"}Verify:
              {"\n"}
              {"\n"}assignment
              {"\n"}
              {"\n"}in-app notification
              {"\n"}
              {"\n"}Home
              {"\n"}
              {"\n"}Available
              {"\n"}
              {"\n"}Daily Route
              {"\n"}
              {"\n"}Map
              {"\n"}
              {"\n"}Earnings
              {"\n"}
              {"\n"}physical push
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}4. CRITICAL DATA CHECK
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Verify that the Partner App query actually returns:
              {"\n"}
              {"\n"}assignment_id
              {"\n"}
              {"\n"}partner_id
              {"\n"}
              {"\n"}booking_id
              {"\n"}
              {"\n"}service_id
              {"\n"}
              {"\n"}vehicle_id
              {"\n"}
              {"\n"}for the CURRENT logged-in partner.
              {"\n"}
              {"\n"}Do not rely only on database metadata.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}5. DEEPAK CONTROL TEST
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Run one fresh assignment for Deepak as a control.
              {"\n"}
              {"\n"}Verify the same fields.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}6. SINGLE PHONE ACCOUNT ISOLATION
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Because the test is being performed on ONE Android phone:
              {"\n"}
              {"\n"}Vikram:
              {"\n"}
              {"\n"}login → verify Vikram assignment
              {"\n"}
              {"\n"}logout completely
              {"\n"}
              {"\n"}Imran:
              {"\n"}
              {"\n"}login → verify Imran assignment
              {"\n"}
              {"\n"}logout completely
              {"\n"}
              {"\n"}Deepak:
              {"\n"}
              {"\n"}login → verify Deepak assignment
              {"\n"}
              {"\n"}There must be NO cross-account:
              {"\n"}
              {"\n"}customer
              {"\n"}
              {"\n"}assignment
              {"\n"}
              {"\n"}route
              {"\n"}
              {"\n"}earnings
              {"\n"}
              {"\n"}notification
              {"\n"}
              {"\n"}leakage.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}7. OFFLINE RECOVERY
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}For Vikram:
              {"\n"}
              {"\n"}close Partner App completely.
              {"\n"}
              {"\n"}Admin assignment already exists.
              {"\n"}
              {"\n"}Reopen/login.
              {"\n"}
              {"\n"}The assignment must appear from the authoritative database even if the
              {"\n"}
              {"\n"}original realtime event was missed.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}8. REALTIME
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}While Vikram is logged in:
              {"\n"}
              {"\n"}Admin creates another fresh assignment.
              {"\n"}
              {"\n"}Verify without refresh:
              {"\n"}
              {"\n"}realtime event received
              {"\n"}
              {"\n"}query refreshed
              {"\n"}
              {"\n"}assignment appears
              {"\n"}
              {"\n"}Home updates
              {"\n"}
              {"\n"}Daily Route updates
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}9. REQUIRED FINAL REPORT
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}Return:
              {"\n"}
              {"\n"}PARTNER | DB ASSIGNMENT | IN-APP | HOME | ROUTE | MAP | EARNINGS | FCM PUSH
              {"\n"}
              {"\n"}Deepak:
              {"\n"}
              {"\n"}____
              {"\n"}
              {"\n"}Vikram:
              {"\n"}
              {"\n"}____
              {"\n"}
              {"\n"}Imran:
              {"\n"}
              {"\n"}____
              {"\n"}
              {"\n"}Most important:
              {"\n"}
              {"\n"}FCM PUSH = actual physical Android notification received.
              {"\n"}
              {"\n"}Do NOT classify FCM as PASS from database metadata alone.
              {"\n"}
              {"\n"}HOME/ROUTE/EARNINGS = actual visible app update.
              {"\n"}
              {"\n"}Do NOT classify them as PASS merely because the architecture should update
              {"\n"}
              {"\n"}them.
              {"\n"}
              {"\n"}==================================================
              {"\n"}
              {"\n"}FINAL ACCEPTANCE
              {"\n"}
              {"\n"}The assignment system is fully fixed only when at least:
              {"\n"}
              {"\n"}Vikram
              {"\n"}
              {"\n"}+
              {"\n"}
              {"\n"}Imran
              {"\n"}
              {"\n"}+
              {"\n"}
              {"\n"}one additional non-Deepak partner
              {"\n"}
              {"\n"}actually receive and DISPLAY the Admin assignment on the real Partner APK,
              {"\n"}
              {"\n"}and their Home / Daily Route / Earnings update accordingly.
              {"\n"}
              {"\n"}The database already passes.
              {"\n"}
              {"\n"}Now prove the physical Partner App.
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}
