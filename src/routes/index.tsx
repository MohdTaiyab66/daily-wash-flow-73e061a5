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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 REAL-DEVICE VERIFICATION — PARTNER LIFECYCLE\n\nDO NOT MODIFY CODE UNLESS A TEST FAILS.\n\nThe Partner Device Registration & Login Recovery fixes are now implemented.\n\nVerify them on REAL Android Partner devices.\n\n==================================================\n\nTEST 1 — VIKRAM\n\n==================================================\n\n1. Install the latest Partner APK.\n\n2. Login as Vikram.\n\n3. Grant notification permission.\n\n4. Wait for app initialization.\n\nVerify immediately:\n\nFCM token exists\n\ntoken is real Firebase token\n\napp_type = partner\n\ntoken active = true\n\ntoken updated_at = current time\n\nVerify Realtime:\n\nlistener mounted\n\nidentity resolved correctly\n\nstatus = SUBSCRIBED\n\nThen verify initial database sync:\n\nassignments loaded\n\nnotifications loaded\n\ntoday route loaded\n\nearnings loaded\n\n==================================================\n\nTEST 2 — IMRAN\n\n==================================================\n\nRepeat the exact same test.\n\nDo NOT compare only code.\n\nVerify the actual database/token/runtime state.\n\n==================================================\n\nTEST 3 — AARAV\n\n==================================================\n\nRepeat the same test.\n\n==================================================\n\nTEST 4 — ADMIN ASSIGNMENT\n\n==================================================\n\nKeep Vikram logged in on the Partner device.\n\nAdmin assigns a fresh Daily Shine booking to Vikram.\n\nWITHOUT REFRESHING:\n\nPartner must receive:\n\n- in-app assignment\n\n- Home update\n\n- Available update\n\n- Daily Route update\n\n- map update\n\n- assignment/earning potential update\n\n- realtime event\n\nIf FCM is valid, actual Android push must also arrive.\n\n==================================================\n\nTEST 5 — OFFLINE RECOVERY\n\n==================================================\n\nClose Vikram's Partner App completely.\n\nAdmin assigns another booking to Vikram.\n\nThen reopen/login Vikram.\n\nExpected immediately:\n\nassignment recovered\n\nnotification visible\n\nHome updated\n\nDaily Route updated\n\ncustomer/vehicle visible\n\nearnings/assignment potential updated\n\nThis must work even though the original realtime event was missed.\n\n==================================================\n\nTEST 6 — REAL VS TRIAL\n\n==================================================\n\nRun the same test for:\n\n1 Real partner\n\n1 Trial partner\n\nBoth must produce:\n\nreal FCM token\n\nRealtime SUBSCRIBED\n\ninitial state sync\n\nfuture assignment updates\n\nsame Home/Route/Notification behavior\n\nNo TRIAL-FCM tokens.\n\n==================================================\n\nREQUIRED PROOF\n\n==================================================\n\nFor Vikram, Imran and Aarav return:\n\npartner_id\n\nauth_id\n\nFCM token exists = PASS/FAIL\n\ntoken active = PASS/FAIL\n\ntoken age\n\napp_type\n\nRealtime SUBSCRIBED = PASS/FAIL\n\ninitial assignment sync = PASS/FAIL\n\nnotification sync = PASS/FAIL\n\nThen one fresh Admin assignment per partner:\n\nassignment created = PASS/FAIL\n\nrealtime event received = PASS/FAIL\n\nHome updated = PASS/FAIL\n\nAvailable updated = PASS/FAIL\n\nDaily Route updated = PASS/FAIL\n\nin-app notification = PASS/FAIL\n\nFCM push = PASS/FAIL\n\nMOST IMPORTANT:\n\nIf ANY partner still has zero push_tokens after logging into the latest APK,\n\ndo not say the lifecycle is fixed.\n\nIdentify why registerPushToken did not execute or why persistence failed.\n\nIf Realtime does not reach SUBSCRIBED, identify the exact failure.\n\nIf the initial database sync works but a new assignment does not appear,\n\nidentify whether the failure is:\n\nRPC\n\nrealtime publication\n\nlistener\n\nRLS\n\nquery invalidation\n\nquery fetch\n\nDo not make another broad architecture change until the first failing layer\n\nis identified.`;

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
