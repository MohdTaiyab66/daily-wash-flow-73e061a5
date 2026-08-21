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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 — EXECUTE REAL-DEVICE TEST NOW\n\nDO NOT CHANGE CODE YET\n\nThe baseline confirms:\n\nDeepak:\n\nFCM token = PASS\n\nVikram:\n\nFCM token = 0\n\nImran:\n\nFCM token = 0\n\nAarav:\n\nFCM token = 0\n\nThe lifecycle fix is supposed to automatically resolve this after login.\n\nDO NOT update src/routes/index.tsx again.\n\n==================================================\n\nTEST VIKRAM\n\n==================================================\n\nUse the latest Partner APK.\n\n1. Install/update APK.\n\n2. Login as Vikram.\n\n3. Grant notification permission.\n\n4. Wait for complete app initialization.\n\nImmediately verify database:\n\npush_tokens row created = YES/NO\n\nreal FCM token = YES/NO\n\nactive = true/false\n\napp_type = partner\n\nupdated_at = current time\n\nVerify runtime logs:\n\n[PARTNER-LIFECYCLE] auth identity\n\n[PARTNER-LIFECYCLE] FCM token obtained\n\n[PARTNER-LIFECYCLE] token registration success\n\n[PARTNER-LIFECYCLE] realtime status = SUBSCRIBED\n\n[PARTNER-LIFECYCLE] initial assignment sync complete\n\n==================================================\n\nTEST IMRAN\n\n==================================================\n\nRepeat exactly.\n\nExpected:\n\nreal FCM token\n\nactive token\n\nRealtime SUBSCRIBED\n\ninitial assignment sync\n\n==================================================\n\nTEST AARAV\n\n==================================================\n\nRepeat exactly.\n\n==================================================\n\nCRITICAL\n\n==================================================\n\nIf ANY of these partners still has:\n\npush_tokens = 0\n\nAFTER LOGIN TO THE LATEST APK,\n\nDO NOT say the lifecycle is fixed.\n\nFind exactly where registration stops:\n\nFirebase initialization\n\n→ permission\n\n→ getToken()\n\n→ registerPushToken()\n\n→ Supabase insert/update\n\n→ partner identity mapping\n\nShow the actual error.\n\n==================================================\n\nREALTIME TEST\n\n==================================================\n\nKeep Vikram logged in.\n\nAdmin assigns Vikram a fresh Daily Shine booking.\n\nWITHOUT REFRESHING:\n\nPartner must receive:\n\n- realtime event\n\n- in-app notification\n\n- Home update\n\n- Available update\n\n- Daily Route update\n\n- map update\n\nIf FCM token is valid:\n\n- Android push must also arrive.\n\n==================================================\n\nOFFLINE RECOVERY\n\n==================================================\n\nClose Vikram's Partner App.\n\nAdmin assigns another booking.\n\nOpen/login Vikram.\n\nExpected immediately:\n\nassignment recovered\n\nnotification visible\n\nHome updated\n\nDaily Route updated\n\ncustomer/vehicle visible\n\n==================================================\n\nFINAL REPORT\n\n==================================================\n\nFor each:\n\nDeepak\n\nVikram\n\nImran\n\nAarav\n\nshow:\n\npartner_id\n\nFCM token exists\n\nactive token\n\ntoken age\n\napp_type\n\nRealtime SUBSCRIBED\n\ninitial sync\n\nassignment recovery\n\nin-app notification\n\nHome update\n\nDaily Route update\n\nFCM push\n\nFor Vikram/Imran/Aarav specifically, identify the exact reason if token\n\nregistration remains zero.\n\nDO NOT make another architecture change until the first failing lifecycle\n\nstep is identified.`;

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
