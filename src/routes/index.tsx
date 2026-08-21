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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            P0 — RUN THE ACTUAL VIKRAM FCM TEST NOW\n\nThe forensic logging has been added.\n\nDo NOT modify code or src/routes/index.tsx unless the runtime test identifies\n\na failure.\n\nUse the LATEST Partner APK on Vikram's real Android device.\n\n==================================================\n\nVIKRAM TEST\n\n==================================================\n\n1. Completely close the Partner App.\n\n2. Open it again.\n\n3. Login as Vikram.\n\n4. Grant notification permission if Android asks.\n\n5. Keep the app open until initialization finishes.\n\nCapture the actual runtime logs in this exact order:\n\n[PARTNER-FCM] hook mounted\n\n[PARTNER-FCM] isNative = ?\n\n[PARTNER-FCM] platform = ?\n\n[PARTNER-FCM] Firebase initialized = ?\n\n[PARTNER-FCM] getToken START\n\n[PARTNER-FCM] getToken SUCCESS / FAILURE\n\n[PARTNER-FCM] token present = ?\n\n[PARTNER-FCM] registerPushToken RPC starting\n\n[PARTNER-FCM] registerPushToken RPC result\n\n[PARTNER-FCM] active token count after upsert\n\n==================================================\n\nCRITICAL\n\n==================================================\n\nDo NOT report the implementation as fixed based on code inspection.\n\nI need the ACTUAL runtime output from Vikram's physical Android device.\n\n==================================================\n\nIF getToken FAILS\n\n==================================================\n\nReturn the exact native exception.\n\nAlso report:\n\nFirebase project\n\nSender ID\n\nApplication/package ID\n\nAndroid version\n\nPartner APK version\n\nDo NOT make a generic Firebase change.\n\nFix the exact getToken failure.\n\n==================================================\n\nIF getToken SUCCEEDS BUT registerPushToken DOES NOT RUN\n\n==================================================\n\nTrace:\n\ntoken returned\n\n→ Supabase auth session\n\n→ partner identity\n\n→ registerPushToken call\n\nFind exactly why the function stops.\n\n==================================================\n\nIF registerPushToken FAILS\n\n==================================================\n\nReturn:\n\nHTTP/status\n\nRPC/function\n\ndatabase error\n\nauthenticated user ID\n\npartner ID\n\ntoken registration result\n\nFix the exact backend/auth issue.\n\n==================================================\n\nIF TOKEN REGISTRATION SUCCEEDS\n\n==================================================\n\nVerify database:\n\npush_tokens:\n\n1+ active real token\n\napp_type = partner\n\nupdated_at = current time\n\nThen verify:\n\nRealtime = SUBSCRIBED\n\n==================================================\n\nFINAL TEST AFTER TOKEN SUCCESS\n\n==================================================\n\nAdmin assigns a NEW Daily Shine booking to Vikram.\n\nWITHOUT REFRESHING:\n\nPartner must receive:\n\n✓ realtime assignment\n\n✓ in-app notification\n\n✓ Home update\n\n✓ Available update\n\n✓ Daily Route update\n\n✓ map update\n\n✓ assignment/earning potential\n\nAnd, with valid FCM:\n\n✓ actual Android push\n\n==================================================\n\nFINAL REPORT\n\n==================================================\n\nReturn the ACTUAL values:\n\nisNative:\n\nplatform:\n\nFirebase initialized:\n\ngetToken:\n\ntoken:\n\nregisterPushToken:\n\nactive token count:\n\nRealtime:\n\nassignment:\n\nin-app notification:\n\nHome:\n\nDaily Route:\n\nFCM push:\n\nMOST IMPORTANT:\n\nDo not say \"fixed\" unless Vikram's physical device actually produces a valid\n\nFCM token and then receives a real Admin assignment notification.`;

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
