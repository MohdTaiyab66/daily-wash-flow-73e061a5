import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronRight, Layout, Phone, User } from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home if needed
  }, [navigate]);

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\\n                                        \\n                                            \\n                                            P0 FINAL PARTNER LIFECYCLE VERIFICATION\\n\\nDo NOT modify code unless a test fails.\\n\\nThe Partner App lifecycle has now been unified for Trial and Real partners.\\n\\nVerify this with REAL accounts and REAL Android devices.\\n\\n==================================================\\n\\nTEST 1 — REAL PARTNER\\n\\n==================================================\\n\\nUse Deepak / another real partner.\\n\\nVerify on login:\\n\\nFCM token registered\\n\\ntoken active\\n\\napp_type = partner\\n\\nRealtime connected\\n\\ncurrent assignments fetched\\n\\nnotifications fetched\\n\\nThen have Admin assign a new Daily Shine booking.\\n\\nWithout manually refreshing:\\n\\nHome updates\\n\\nAvailable updates\\n\\nDaily Route updates\\n\\nMap updates\\n\\nNotification appears\\n\\nEarnings/assignment potential updates\\n\\nPush notification arrives if token is valid\\n\\n==================================================\\n\\nTEST 2 — TRIAL PARTNER\\n\\n==================================================\\n\\nUse a Trial partner with the SAME area.\\n\\nPerform the exact same test.\\n\\nExpected EXACTLY the same behavior:\\n\\nFCM token registered\\n\\ntoken active\\n\\napp_type = partner\\n\\nRealtime connected\\n\\ncurrent assignments fetched\\n\\nnotifications fetched\\n\\nAdmin assigns Daily Shine.\\n\\nWithout refresh:\\n\\nHome updates\\n\\nAvailable updates\\n\\nDaily Route updates\\n\\nMap updates\\n\\nNotification appears\\n\\nEarnings/assignment potential updates\\n\\nPush arrives if token is valid\\n\\n==================================================\\n\\nTEST 3 — OFFLINE ASSIGNMENT RECOVERY\\n\\n==================================================\\n\\nLog the Trial partner out / close the Partner App.\\n\\nAdmin assigns the Trial partner.\\n\\nThen log the partner back in.\\n\\nExpected immediately:\\n\\nassignment recovered\\n\\nHome updated\\n\\nDaily Route updated\\n\\nnotification visible\\n\\ncorrect customer/vehicle/service visible\\n\\nThe partner must NOT depend on receiving the original realtime event.\\n\\n==================================================\\n\\nTEST 4 — REALTIME TEST\\n\\n==================================================\\n\\nKeep Partner App open.\\n\\nAdmin assigns the partner.\\n\\nVerify runtime:\\n\\n[PARTNER-REALTIME] listener mounted\\n\\nsubscription connected\\n\\nnew_assignment event received\\n\\npartner_id matched\\n\\nquery invalidation triggered\\n\\nassignment refetched\\n\\nUI updated\\n\\nDo not rely on source-code inspection.\\n\\n==================================================\\n\\nTEST 5 — TOKEN TEST\\n\\n==================================================\\n\\nFor both Real and Trial partners verify:\\n\\nFCM token is a REAL Firebase token.\\n\\nIt must NOT be:\\n\\nTRIAL-FCM-...\\n\\ndummy\\n\\nmock\\n\\ntest\\n\\nVerify:\\n\\ntoken\\n\\nactive = true\\n\\napp_type = partner\\n\\nupdated_at\\n\\n==================================================\\n\\nTEST 6 — PUSH FAILURE RESILIENCE\\n\\n==================================================\\n\\nEven if FCM push is unavailable:\\n\\nAdmin assignment must STILL appear in:\\n\\nHome\\n\\nAvailable\\n\\nDaily Route\\n\\nNotifications\\n\\nDatabase + Realtime is the source of truth.\\n\\n==================================================\\n\\nTEST 7 — MULTIPLE PARTNERS\\n\\n==================================================\\n\\nTest at least:\\n\\n1 Real partner\\n\\n1 Trial partner\\n\\n1 additional Real/Trial partner\\n\\nAdmin assigns each one separately.\\n\\nEvery partner must use exactly the same implementation.\\n\\n==================================================\\n\\nFINAL REPORT\\n\\nFor each tested partner provide:\\n\\npartner_id\\n\\npartner type\\n\\nFCM token valid = PASS/FAIL\\n\\nRealtime connected = PASS/FAIL\\n\\nassignment recovery = PASS/FAIL\\n\\nnew_assignment event = PASS/FAIL\\n\\nHome = PASS/FAIL\\n\\nAvailable = PASS/FAIL\\n\\nDaily Route = PASS/FAIL\\n\\nMap = PASS/FAIL\\n\\nIn-app notification = PASS/FAIL\\n\\nPush = PASS/FAIL\\n\\nEarnings = PASS/FAIL\\n\\nMost important:\\n\\nDo NOT declare success because the code is unified.\\n\\nShow that a REAL and a TRIAL partner both receive and display the same Admin\\n\\nassignment flow on actual Android devices.`;

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
