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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 UNIVERSAL PARTNER ONBOARDING + LIFECYCLE\n\nIMPORTANT CONTEXT:\n\nVikram, Imran and Aarav are TRIAL partner accounts that had NEVER logged into\n\nthe Partner App before.\n\nTherefore their previous:\n\n0 FCM tokens\n\n0 active Realtime sessions\n\nwas expected before first login.\n\nAarav has now successfully registered a REAL Android FCM token after first\n\nlogin, proving the new client registration flow works.\n\nNOW MAKE THIS UNIVERSAL.\n\nThis must work automatically for:\n\n- existing Real partners\n\n- existing Trial partners\n\n- every newly created Trial partner\n\n- every newly created Real partner\n\n- future partner accounts of any valid partner type\n\nDO NOT create partner-specific fixes.\n\n==================================================\n\n1. FIRST LOGIN MUST INITIALIZE EVERYTHING\n\n==================================================\n\nWhenever ANY partner logs into the Partner APK for the first time:\n\nLOGIN\n\n↓\n\nAUTH SESSION\n\n↓\n\nRESOLVE CANONICAL PARTNER\n\n↓\n\nREGISTER REAL FCM TOKEN\n\n↓\n\nCONNECT SUPABASE REALTIME\n\n↓\n\nFETCH CURRENT ASSIGNMENTS\n\n↓\n\nFETCH NOTIFICATIONS\n\n↓\n\nFETCH TODAY ROUTE\n\n↓\n\nFETCH EARNINGS\n\n↓\n\nPARTNER APP FULLY INITIALIZED\n\nNo manual database work.\n\n==================================================\n\n2. REAL FCM TOKEN FOR EVERY PARTNER\n\n==================================================\n\nOn first login/app startup:\n\nFirebase initialize\n\n→ getToken()\n\n→ save token to push_tokens\n\nThe token must be a REAL Firebase token.\n\nNever create:\n\nTRIAL-FCM\n\ndummy token\n\nmock token\n\ntest token\n\nStore:\n\npartner/user identity\n\nFCM token\n\napp_type = partner\n\nplatform = android\n\nactive = true\n\nupdated_at\n\n==================================================\n\n3. EXISTING PARTNERS\n\n==================================================\n\nFor current partners who already exist:\n\nAt next login/app startup:\n\nif token missing:\n\nregister automatically\n\nif token inactive:\n\nrefresh/register automatically\n\nif token expired/UNREGISTERED:\n\nreplace with current token automatically\n\nif realtime disconnected:\n\nreconnect automatically\n\nif assignments were created while offline:\n\nrecover them automatically from database\n\nDo NOT require admin intervention.\n\n==================================================\n\n4. FUTURE PARTNERS\n\n==================================================\n\nThis is critical.\n\nWhen Admin creates a NEW partner account tomorrow:\n\nNo additional developer action should be required.\n\nWhen the new partner installs the latest Partner APK and logs in:\n\nall of the same lifecycle automatically runs.\n\nDo NOT require:\n\nmanual token insertion\n\nmanual realtime setup\n\nmanual SQL\n\nmanual admin activation of notifications\n\n==================================================\n\n5. TRIAL VS REAL\n\n==================================================\n\nTrial and Real partners may have different business privileges.\n\nBUT they must use the SAME technical infrastructure for:\n\nFCM\n\nRealtime\n\nauthentication\n\nassignment recovery\n\nnotifications\n\nHome\n\nDaily Route\n\nEarnings\n\nDo not let:\n\nis_trial\n\npartner_type\n\naccount_type\n\ndisable or bypass technical initialization.\n\n==================================================\n\n6. LOGIN RECOVERY\n\n==================================================\n\nRealtime alone is NOT sufficient.\n\nEvery app startup/login must first perform an authoritative sync:\n\nactive assignments\n\ntoday's route\n\nnotifications\n\nearnings\n\nTHEN establish realtime for future changes.\n\nCorrect lifecycle:\n\nLOGIN\n\n→ initial database sync\n\n→ render current state\n\n→ connect realtime\n\n→ listen for future events\n\nThis guarantees partners do not miss assignments while offline.\n\n==================================================\n\n7. ADMIN ASSIGNMENT\n\n==================================================\n\nAfter any Admin assignment:\n\nPartner App should update for ANY partner who is authenticated.\n\nThe flow must work identically for:\n\nDeepak\n\nVikram\n\nImran\n\nAarav\n\nfuture partners\n\nNo partner-specific conditions.\n\n==================================================\n\n8. PUSH NOTIFICATION\n\n==================================================\n\nPush is an alert layer.\n\nIf a valid FCM token exists:\n\nsend push.\n\nIf push fails:\n\nassignment still appears in:\n\nHome\n\nAvailable\n\nDaily Route\n\nNotifications\n\nDatabase/realtime is the source of truth.\n\n==================================================\n\n9. PARTNER AREA\n\n==================================================\n\nTechnical lifecycle must not depend on the partner having previously logged\n\nin.\n\nWhen the partner first logs in, resolve their authoritative:\n\npartners.id\n\nhome_area\n\nhome_zone_id\n\nstatus\n\nrole\n\nIf required business data is missing:\n\nshow the correct onboarding/data state.\n\nDo NOT silently create a broken \"ghost\" partner.\n\n==================================================\n\n10. FINAL AUTOMATED TEST\n\n==================================================\n\nTest all three categories:\n\nA. Existing Real partner\n\nB. Existing Trial partner\n\nC. Newly created partner\n\nFor each:\n\nfirst login\n\n→ token created\n\n→ realtime connected\n\n→ initial data sync\n\n→ Admin assignment\n\n→ Partner receives assignment\n\n→ Home updates\n\n→ Daily Route updates\n\n→ in-app notification\n\n→ push if token valid\n\n==================================================\n\n11. NEW PARTNER TEST\n\n==================================================\n\nCreate a brand-new partner account.\n\nDo NOT manually insert a push token.\n\nInstall/open latest Partner APK.\n\nLogin.\n\nExpected automatically:\n\npush_tokens row created\n\nreal FCM token\n\nactive token\n\nRealtime SUBSCRIBED\n\ninitial assignment sync complete\n\nnotification sync complete\n\nHome loaded\n\nDaily Route loaded\n\nEarnings loaded\n\nThen Admin assigns a Daily Shine booking.\n\nExpected:\n\nassignment appears\n\nin-app notification appears\n\nHome updates\n\nDaily Route updates\n\npush arrives if permission/token valid\n\n==================================================\n\n12. NO DEEPAK-SPECIFIC LOGIC\n\n==================================================\n\nSearch entire codebase for:\n\n9000000006\n\nDeepak\n\ndeepak\n\nThere must be no partner-specific behavior.\n\nAlso search for:\n\nTRIAL-FCM\n\ndummy token\n\nmock token\n\nis_trial bypass\n\ntrial notification bypass\n\nRemove any technical special cases.\n\n==================================================\n\nFINAL ACCEPTANCE\n\nThe system must work automatically for:\n\nALL CURRENT PARTNERS\n\n+\n\nALL FUTURE PARTNERS\n\nregardless of:\n\nTrial / Real\n\nfirst login / later login\n\nonline / offline at assignment time\n\npush token previously registered / missing\n\nrealtime previously connected / disconnected\n\nThe partner should only need to:\n\nINSTALL APP\n\n→ LOGIN\n\nEverything else must initialize automatically.\n\nDo not manually repair individual partner accounts.\n\nFix the lifecycle at the product/system level.`;

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
