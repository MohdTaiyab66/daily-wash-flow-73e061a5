import { useEffect } from "react";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronRight, Layout, Phone, User } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home if needed
  }, [navigate]);

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 — FINAL ALL-PARTNER REAL-DEVICE VALIDATION\n\nThe full partner population has now been audited:\n\nTOTAL PARTNERS: 26\n\nREAL: 23\n\nTRIAL: 3\n\nREADY: 2\n\nTOKEN MISSING: 23\n\nDATA ERROR: 1\n\nThe universal lifecycle implementation is already in place.\n\nDO NOT modify the architecture or update src/routes/index.tsx.\n\nNow perform the actual validation of the universal lifecycle.\n\n==================================================\n\n1. DO NOT MANUALLY FIX THE 23 PARTNERS\n\n==================================================\n\nPartners with no FCM token may simply never have opened the latest Partner\n\nAPK.\n\nDo NOT manually insert tokens into the database.\n\nThe system must automatically initialize them when they log in.\n\n==================================================\n\n2. TEST EXISTING PARTNERS\n\n==================================================\n\nTake a representative group from the 23 TOKEN MISSING partners:\n\n- several Real partners\n\n- all remaining Trial partners\n\n- the DATA ERROR partner after correcting the credential issue through the\n\n  normal supported account/login flow\n\nFor each:\n\nOpen latest Partner APK\n\n→ Login\n\n→ wait for initialization\n\nVerify automatically:\n\nFCM token created\n\nactive token = true\n\napp_type = partner\n\nRealtime = SUBSCRIBED\n\ninitial assignment sync = complete\n\nnotifications sync = complete\n\nHome = loaded\n\nDaily Route = loaded\n\nEarnings = loaded\n\n==================================================\n\n3. ADMIN ASSIGNMENT TEST\n\n==================================================\n\nFor every tested partner:\n\nAdmin assigns a fresh Daily Shine booking.\n\nWITHOUT manually refreshing Partner App:\n\nverify:\n\nassignment appears\n\nin-app notification appears\n\nHome updates\n\nAvailable updates\n\nDaily Route updates\n\nmap updates\n\nearning potential updates\n\nIf valid FCM token + permission:\n\nreal Android push must arrive.\n\n==================================================\n\n4. OFFLINE RECOVERY\n\n==================================================\n\nFor at least one Real and one Trial partner:\n\nClose Partner App completely.\n\nAdmin assigns the booking.\n\nReopen/login Partner App.\n\nExpected:\n\nassignment recovered automatically\n\nnotification visible\n\nHome updated\n\nDaily Route updated\n\ncustomer/vehicle visible\n\nearnings/potential updated\n\nThe partner must NOT need to receive the original realtime event.\n\n==================================================\n\n5. BRAND-NEW PARTNER TEST\n\n==================================================\n\nCreate ONE completely new partner account.\n\nDo not manually add:\n\nFCM token\n\nRealtime record\n\nnotification record\n\nassignment record\n\nInstall latest Partner APK and login.\n\nExpected automatically:\n\nreal FCM token\n\nactive token\n\nRealtime SUBSCRIBED\n\ninitial sync\n\nHome\n\nDaily Route\n\nNotifications\n\nEarnings\n\nThen Admin assigns a Daily Shine booking.\n\nVerify the entire flow.\n\n==================================================\n\n6. ALL-PARTNER INVENTORY AFTER TESTS\n\n==================================================\n\nRe-run the complete partner audit.\n\nReturn:\n\nTOTAL PARTNERS\n\nREAL\n\nTRIAL\n\nREADY\n\nTOKEN MISSING\n\nREALTIME OFFLINE\n\nDATA ERROR\n\nThe READY count should increase for every partner who actually completed\n\nfirst-login on the latest Partner APK.\n\nDO NOT mark TOKEN MISSING as a code failure if that partner has never logged\n\ninto the latest APK.\n\n==================================================\n\n7. IMPORTANT DATA-ERROR PARTNER\n\n==================================================\n\nFor the one DATA ERROR partner:\n\nIdentify exactly what \"stale credentials\" means.\n\nDo not bypass security.\n\nUse the normal account/login/token lifecycle to correct it.\n\nThen verify:\n\nFCM\n\nRealtime\n\ninitial sync\n\nassignment\n\n==================================================\n\n8. UNIVERSALITY CHECK\n\n==================================================\n\nConfirm the same code path is used for:\n\nReal\n\nTrial\n\nOld\n\nNew\n\nNo partner-specific exceptions.\n\nNo special Deepak logic.\n\nNo fake TRIAL-FCM tokens.\n\n==================================================\n\nFINAL ACCEPTANCE\n\nThe universal implementation is successful when:\n\nANY valid existing partner\n\nOR\n\nANY newly created partner\n\ncan:\n\nLOGIN\n\n→ get real FCM token\n\n→ connect Realtime\n\n→ load current assignments\n\n→ receive Admin assignment\n\n→ update Home\n\n→ update Daily Route\n\n→ update Notifications\n\n→ update Earnings\n\n→ receive push when available\n\nwithout manual database intervention.\n\nReturn the final ALL-PARTNER audit and the exact number of partners that were\n\nsuccessfully validated on real Android devices.`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">UW</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Urban Wash</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Services</a>
            <a href="#" className="hover:text-primary transition-colors">Pricing</a>
            <a href="#" className="hover:text-primary transition-colors">Locations</a>
            <Button onClick={() => navigate({ to: "/auth" })}>Partner Login</Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          <section className="text-center space-y-6">
            <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter">
              Premium Car Care <br />
              <span className="text-primary">At Your Doorstep</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional waterless car wash and detailing services delivered to your home or office. Quality you can trust, convenience you'll love.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" className="px-8" onClick={() => navigate({ to: "/auth" })}>
                Book a Wash
              </Button>
              <Button size="lg" variant="outline" className="px-8">
                Learn More
              </Button>
            </div>
          </section>

          <Card className="border-2 border-primary/10 shadow-xl overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-slate-900 p-6 md:p-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-primary">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">System Status: Active</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-slate-400 font-medium uppercase">Live Sync</span>
                  </div>
                </div>
                
                <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm overflow-x-auto border border-slate-800">
                  <pre className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {replacementText}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<Layout className="w-6 h-6" />}
              title="Smart Scheduling"
              description="Pick a time that works for you. Our system handles the rest."
            />
            <FeatureCard 
              icon={<User className="w-6 h-6" />}
              title="Expert Partners"
              description="Trained professionals equipped with premium cleaning kits."
            />
            <FeatureCard 
              icon={<Phone className="w-6 h-6" />}
              title="Real-time Updates"
              description="Track your service progress from start to finish via our app."
            />
          </div>
        </div>
      </main>

      <footer className="border-t py-12 mt-20">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 Urban Wash. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="group hover:border-primary/50 transition-all cursor-default">
      <CardContent className="p-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
          {icon}
        </div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
        <div className="flex items-center text-primary font-medium text-sm group-hover:translate-x-1 transition-transform">
          Read more <ChevronRight className="w-4 h-4" />
        </div>
      </CardContent>
    </Card>
  );
}
