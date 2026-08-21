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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\\n                                        \\n                                            \\n                                            URBAN WASH — P0 FIX: PARTNER DEVICE REGISTRATION + LOGIN RECOVERY\\n\\nThe forensic audit found the FIRST real divergence:\\n\\nWORKING:\\n\\nDeepak 9000000006\\n\\n- valid fresh FCM token\\n\\n- active Realtime connection\\n\\n- assignment visible\\n\\n- push works\\n\\nFAILING:\\n\\nVikram\\n\\nImran\\n\\nAarav\\n\\n- ZERO push_tokens rows\\n\\n- no active Realtime connection\\n\\n- therefore no push and no live assignment updates\\n\\nDo NOT manually insert tokens into the database.\\n\\nDo NOT create partner-specific exceptions.\\n\\nFix the Partner APK lifecycle so EVERY partner automatically becomes fully\\n\\noperational after installing/logging into the Partner App.\\n\\n==================================================\\n\\n1. REAL PARTNER LIFECYCLE\\n\\n==================================================\\n\\nOn every Partner APK, regardless of Trial/Real status:\\n\\nAPP START\\n\\n↓\\n\\nFirebase initializes\\n\\n↓\\n\\nrequest notification permission where required\\n\\n↓\\n\\nget current FCM token\\n\\n↓\\n\\nregister token in push_tokens\\n\\n↓\\n\\nauthenticate partner\\n\\n↓\\n\\nresolve canonical partners.id\\n\\n↓\\n\\nconnect Supabase Realtime\\n\\n↓\\n\\nfetch current assignments\\n\\n↓\\n\\nfetch current notifications\\n\\n↓\\n\\nfetch Home/Route/Earnings\\n\\n↓\\n\\nPartner is fully operational\\n\\nThis must happen automatically.\\n\\n==================================================\\n\\n2. FCM TOKEN REGISTRATION\\n\\n==================================================\\n\\nAudit the actual Partner Android implementation.\\n\\nVerify:\\n\\nFirebase.initialize\\n\\nFirebaseMessaging.getToken()\\n\\nonNewToken()\\n\\ntoken persistence\\n\\npush_tokens insert/update\\n\\nFor every authenticated partner:\\n\\npush_tokens must contain:\\n\\nuser/account ID\\n\\npartner identity\\n\\nFCM token\\n\\napp_type = partner\\n\\nplatform = android\\n\\nactive = true\\n\\nupdated_at\\n\\nDo NOT use:\\n\\nTRIAL-FCM\\n\\ndummy token\\n\\nmock token\\n\\nhardcoded token\\n\\nTrial partners MUST receive REAL FCM tokens from the same Partner APK.\\n\\n==================================================\\n\\n3. IMPORTANT — IDENTITY MAPPING\\n\\n==================================================\\n\\nThe audit says assignments/notifications use:\\n\\npartner_id = auth.uid()\\n\\nVerify that this is actually correct for ALL partner accounts.\\n\\nCompare:\\n\\nauth.users.id\\n\\npartners.id\\n\\nuser_roles.user_id\\n\\npush_tokens.user_id\\n\\nassignment.partner_id\\n\\nDo not assume they are always identical.\\n\\nIf the Partner App registers the token against the wrong identity, fix the\\n\\nmapping.\\n\\nThe canonical identity used by RLS and assignment queries must be consistent.\\n\\n==================================================\\n\\n4. REALTIME CONNECTION\\n\\n==================================================\\n\\nThe Partner App must establish Supabase Realtime for EVERY authenticated\\n\\npartner.\\n\\nOn login/app startup:\\n\\nconnect global listener\\n\\nsubscribe successfully\\n\\nkeep the listener mounted during app navigation\\n\\nLog temporarily:\\n\\n[PARTNER-LIFECYCLE]\\n\\nauth partner id\\n\\n[PARTNER-LIFECYCLE]\\n\\nrealtime connecting\\n\\n[PARTNER-LIFECYCLE]\\n\\nrealtime status\\n\\n[PARTNER-LIFECYCLE]\\n\\nrealtime connected\\n\\nDo not depend on a page such as Home being open.\\n\\n==================================================\\n\\n5. LOGIN RECOVERY\\n\\n==================================================\\n\\nThis is critical.\\n\\nA partner might have been offline when Admin assigned a service.\\n\\nWhen the partner logs in/open the app:\\n\\nALWAYS perform an authoritative server/database fetch for:\\n\\n- active assignments\\n\\n- today's route\\n\\n- unread partner notifications\\n\\n- earnings\\n\\n- current assignment\\n\\nDo NOT rely only on the Realtime event.\\n\\nCorrect lifecycle:\\n\\nLOGIN\\n\\n→ fetch current state\\n\\n→ render current state\\n\\n→ connect realtime\\n\\n→ listen for future changes\\n\\nThis guarantees no missed assignments.\\n\\n==================================================\\n\\n6. FCM TOKEN RECOVERY\\n\\n==================================================\\n\\nIf the backend contains:\\n\\nno token\\n\\nor:\\n\\ninactive/UNREGISTERED token\\n\\nthen on app startup/login:\\n\\nget a fresh Firebase token\\n\\n→ register it\\n\\n→ activate it\\n\\nDo NOT wait for an FCM callback that may never occur.\\n\\nAlso handle:\\n\\nonNewToken()\\n\\nand update the backend immediately.\\n\\n==================================================\\n\\n7. NOTIFICATION PERMISSION\\n\\n==================================================\\n\\nFor Android 13+:\\n\\nrequest POST_NOTIFICATIONS permission correctly.\\n\\nIf permission is denied:\\n\\nthe Partner App must STILL:\\n\\n- register the assignment\\n\\n- show in-app notification\\n\\n- update Home\\n\\n- update Route\\n\\nPush is optional delivery.\\n\\nIt must not affect assignment eligibility or assignment visibility.\\n\\n==================================================\\n\\n8. TRIAL PARTNERS\\n\\n==================================================\\n\\nTrial/Real must use exactly the same:\\n\\nFirebase configuration\\n\\nFCM token registration\\n\\nRealtime\\n\\nRLS\\n\\nassignment query\\n\\nnotification query\\n\\nHome\\n\\nDaily Route\\n\\nEarnings\\n\\nSearch for:\\n\\nTRIAL-FCM\\n\\nTRIAL-FCM-partner\\n\\ntrial token\\n\\ndummy token\\n\\nmock token\\n\\nis_trial\\n\\nRemove any code path that intentionally creates fake Partner tokens.\\n\\nA Trial partner must behave like a Real partner from the infrastructure\\n\\nperspective.\\n\\n==================================================\\n\\n9. EXISTING PARTNER ACCOUNTS\\n\\n==================================================\\n\\nAfter deploying the fix, existing partners such as:\\n\\nVikram\\n\\nImran\\n\\nAarav\\n\\nmust recover automatically after opening/logging into the latest Partner APK.\\n\\nDo NOT require:\\n\\nmanual DB token insertion\\n\\nadmin DB edits\\n\\nrecreating partner accounts\\n\\n==================================================\\n\\n10. ASSIGNMENT RECOVERY TEST\\n\\n==================================================\\n\\nUse:\\n\\nVikram\\n\\nImran\\n\\nAarav\\n\\nFor each:\\n\\n1. Install/open latest Partner APK.\\n\\n2. Login.\\n\\n3. Verify a fresh FCM token exists.\\n\\n4. Verify Realtime connects.\\n\\n5. Admin assigns a new Daily Shine booking.\\n\\n6. Do NOT refresh the app manually.\\n\\nExpected:\\n\\n✓ in-app assignment notification\\n\\n✓ Home updates\\n\\n✓ Available updates\\n\\n✓ Daily Route updates\\n\\n✓ map updates\\n\\n✓ earnings potential updates\\n\\n✓ realtime event received\\n\\n✓ push notification if permission/token valid\\n\\n==================================================\\n\\n11. OFFLINE ASSIGNMENT TEST\\n\\n==================================================\\n\\nTake Vikram completely offline/close the app.\\n\\nAdmin assigns Vikram.\\n\\nThen reopen/login Vikram.\\n\\nExpected immediately:\\n\\nassignment recovered\\n\\nnotification visible\\n\\nHome updated\\n\\nDaily Route updated\\n\\ncustomer/vehicle visible\\n\\nNo missed assignment.\\n\\n==================================================\\n\\n12. PUSH FAILURE TEST\\n\\n==================================================\\n\\nEven if FCM push fails:\\n\\nassignment must still appear through:\\n\\ndatabase fetch\\n\\n+\\n\\nRealtime\\n\\n+\\n\\nin-app notification\\n\\nPush is NOT the source of truth.\\n\\n==================================================\\n\\n13. PARITY WITH DEEPAK\\n\\n==================================================\\n\\nAfter the fix compare:\\n\\nDeepak\\n\\nVikram\\n\\nImran\\n\\nAarav\\n\\nEvery one must have:\\n\\nvalid FCM token\\n\\nRealtime connected\\n\\nassignment recovery\\n\\nin-app notifications\\n\\nHome\\n\\nAvailable\\n\\nDaily Route\\n\\nMap\\n\\nEarnings\\n\\nNo partner should require special treatment.\\n\\n==================================================\\n\\n14. REQUIRED FORENSIC REPORT\\n\\n==================================================\\n\\nFor each tested partner provide:\\n\\npartner_id\\n\\nauth_id\\n\\npush_token_count\\n\\nactive_token_count\\n\\ntoken_updated_at\\n\\napp_type\\n\\nrealtime_status\\n\\ncurrent_assignment_count\\n\\nnotification_count\\n\\nThen:\\n\\nDeepak = PASS/FAIL\\n\\nVikram = PASS/FAIL\\n\\nImran = PASS/FAIL\\n\\nAarav = PASS/FAIL\\n\\nMost important:\\n\\nIf a partner still has ZERO push_tokens after opening/logging into the latest\\n\\nPartner APK, identify exactly why token registration did not occur.\\n\\nIf Realtime is still disconnected after login, identify exactly why.\\n\\nDo not say \"ghost account\".\\n\\nFix the lifecycle that makes an account operational.\\n\\n==================================================\\n\\nFINAL ACCEPTANCE\\n\\n==================================================\\n\\nA newly created Partner account — Trial OR Real — must automatically become:\\n\\nAUTHENTICATED\\n\\n+\\n\\nREAL FCM TOKEN\\n\\n+\\n\\nREALTIME CONNECTED\\n\\n+\\n\\nCURRENT ASSIGNMENTS LOADED\\n\\n+\\n\\nNOTIFICATIONS LOADED\\n\\n+\\n\\nHOME/ROUTE/EARNINGS LOADED\\n\\nafter login.\\n\\nNo manual database work.\\n\\nNo Deepak exception.\\n\\nNo fake tokens.\\n\\nNo ghost partners.`;

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
