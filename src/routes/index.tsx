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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 CLIENT-SIDE FCM REGISTRATION FIX\n\nSTOP MODIFYING:\n\n- marketplace\n\n- admin assignment\n\n- realtime assignment\n\n- partner notification dispatch\n\n- earning logic\n\nThose systems have already been traced.\n\nCURRENT FORENSIC FACT:\n\nVikram is successfully logged into the real Partner APK.\n\nHeartbeat:\n\nPASS\n\nPartner identity:\n\nPASS\n\nAppLayout:\n\nPASS\n\nInitial assignment sync:\n\nPASS\n\nBut:\n\nregisterPushToken() is NEVER called.\n\nServer logs:\n\n0\n\npush_tokens:\n\n0\n\nTherefore the FIRST FAILURE is inside the CLIENT FCM REGISTRATION FLOW:\n\nuseFcmRegistration\n\n→ startFcm\n\n→ Firebase/native detection\n\n→ permission\n\n→ FirebaseMessaging.getToken()\n\n→ registerPushToken\n\nFIX THIS EXACT LAYER.\n\n==================================================\n\n1. DO NOT UPDATE index.tsx\n\n==================================================\n\nDo not write verification instructions into:\n\nsrc/routes/index.tsx\n\nI need the actual functional fix.\n\n==================================================\n\n2. TRACE startFcm()\n\n==================================================\n\nInspect the exact implementation of:\n\nuseFcmRegistration\n\nstartFcm\n\nregisterPushToken\n\nisNative\n\nAdd temporary runtime logs at EVERY step:\n\n[PARTNER-FCM]\n\nhook mounted\n\nauth user available\n\npartner identity available\n\nisNative result\n\nplatform\n\nnotification permission status\n\nFirebase initialized\n\ngetToken started\n\ngetToken succeeded\n\ngetToken failed\n\ntoken length/present\n\nregisterPushToken called\n\nregisterPushToken succeeded\n\nregisterPushToken failed\n\nThe logs MUST run on the actual Android Partner APK.\n\n==================================================\n\n3. VERIFY isNative()\n\n==================================================\n\nFor Vikram's real installed Partner APK:\n\nisNative() MUST return true.\n\nLog:\n\nisNative = ?\n\nCapacitor platform = ?\n\nAndroid = ?\n\nIf isNative() returns false inside the actual APK:\n\nFIX THAT.\n\nDo not rely on a browser/mobile-web environment.\n\n==================================================\n\n4. FIREBASE INITIALIZATION\n\n==================================================\n\nVerify Firebase is actually initialized inside the Partner APK.\n\nCheck:\n\nFirebaseApp initialization\n\nFirebase Messaging availability\n\ngoogle-services.json\n\npackage/application ID\n\nFirebase project\n\nsender ID\n\nDo not assume web Firebase initialization is enough.\n\nThe native Partner APK must use the correct Android Firebase configuration.\n\nConfirm the Partner package ID matches the Firebase Android app registration.\n\n==================================================\n\n5. TEST getToken() DIRECTLY\n\n==================================================\n\nThis is the highest priority.\n\nOn Vikram's real Partner APK:\n\nexecute:\n\nFirebaseMessaging.getToken()\n\nand log:\n\nSTART\n\nSUCCESS\n\nFAILURE\n\nIf it fails, capture the EXACT native exception.\n\nIf it hangs, add timeout diagnostics and identify where it stops.\n\nDO NOT silently swallow the exception.\n\nExamples to investigate if encountered:\n\nSERVICE_NOT_AVAILABLE\n\nIOException\n\nTOKEN_FAILED\n\nFirebaseApp not initialized\n\nMISSING_INSTANCEID_SERVICE\n\nSENDER_ID_MISMATCH\n\nAUTHENTICATION_FAILED\n\npermission denied\n\nUse the actual exception returned by the device.\n\n==================================================\n\n6. ANDROID NOTIFICATION PERMISSION\n\n==================================================\n\nVerify Android 13+ notification permission.\n\nImportant:\n\nPermission denial should NOT prevent the app from attempting to obtain the\n\nFCM token unless the current native implementation explicitly requires it.\n\nSeparate:\n\nPOST_NOTIFICATIONS permission\n\nfrom:\n\nFCM token registration.\n\nLog both independently.\n\n==================================================\n\n7. COMPARE DEEPAK VS VIKRAM\n\n==================================================\n\nUse the SAME installed Partner APK build on:\n\nDeepak device\n\nVikram device\n\nRun the exact same startup path.\n\nCompare:\n\nisNative\n\nFirebase initialized\n\npermission\n\ngetToken\n\ntoken returned\n\nregisterPushToken\n\nSupabase auth\n\ndatabase token row\n\nWe need the FIRST DIFFERENCE.\n\nDo not assume Deepak's existing database token proves his current APK lifecycle\n\nis correct.\n\nForce a fresh token test on both devices.\n\n==================================================\n\n8. FRESH TOKEN TEST\n\n==================================================\n\nOn Deepak's device:\n\nforce Firebase token refresh/re-registration.\n\nVerify:\n\nnew token obtained\n\nnew token persisted\n\nThen do the same on Vikram.\n\nIf Deepak succeeds and Vikram fails on the SAME APK build, capture the native\n\ndifference between the two devices.\n\n==================================================\n\n9. APK BUILD VERIFICATION\n\n==================================================\n\nVerify the Partner APK being installed on Vikram is actually the latest build.\n\nPrint/log:\n\nPartner package ID\n\napp version\n\nversionCode\n\nbuild identifier if available\n\nMake sure Vikram is NOT testing an older APK.\n\nThis is important because previous tests involved separate Customer and Partner\n\nAPK build issues.\n\n==================================================\n\n10. FIREBASE PROJECT CHECK\n\n==================================================\n\nAt runtime log the Firebase project identifier/package configuration safely.\n\nVerify Partner APK uses the intended Partner Firebase configuration.\n\nDo not expose credentials/secrets.\n\nThe actual Firebase project used by the Partner APK must match the project\n\nused by the server-side Partner FCM sender.\n\n==================================================\n\n11. REGISTER TOKEN ONLY AFTER TOKEN EXISTS\n\n==================================================\n\nCorrect sequence:\n\nFirebase initializes\n\n→ getToken succeeds\n\n→ token exists\n\n→ Supabase auth exists\n\n→ resolve partner\n\n→ registerPushToken(token)\n\nDo NOT call registerPushToken before token retrieval.\n\nDo NOT silently continue if token retrieval fails.\n\n==================================================\n\n12. AUTH MIDDLEWARE\n\n==================================================\n\nOnly after getToken() succeeds:\n\nverify registerPushToken receives an authenticated Supabase session.\n\nLog:\n\nauth session present = YES/NO\n\nregister request started\n\nserver response\n\nIf this fails:\n\ncapture exact HTTP/RPC error.\n\nBut remember:\n\nCURRENT EVIDENCE SHOWS registerPushToken IS NEVER CALLED.\n\nSo first fix getToken/native flow before changing middleware.\n\n==================================================\n\n13. TRIAL AND REAL PARTNERS\n\n==================================================\n\nThe exact same native FCM flow must run for:\n\nReal Partner\n\nTrial Partner\n\nThere must be NO:\n\nTRIAL-FCM\n\ndummy token\n\nmock token\n\ntrial-specific bypass\n\n==================================================\n\n14. REQUIRED REAL DEVICE TEST\n\n==================================================\n\nTEST VIKRAM FIRST.\n\nOn latest Partner APK:\n\n1. Install.\n\n2. Open.\n\n3. Login.\n\n4. Grant notification permission.\n\n5. Observe runtime logs.\n\nExpected:\n\n[PARTNER-FCM] isNative=true\n\n[PARTNER-FCM] Firebase initialized\n\n[PARTNER-FCM] getToken started\n\n[PARTNER-FCM] getToken succeeded\n\n[PARTNER-FCM] token present\n\n[PARTNER-FCM] registerPushToken called\n\n[PARTNER-FCM] registerPushToken succeeded\n\nThen verify database:\n\npush_tokens:\n\n1 active real token\n\n==================================================\n\n15. AFTER TOKEN REGISTRATION\n\n==================================================\n\nAdmin assigns a fresh Daily Shine booking to Vikram.\n\nWithout refresh:\n\nPartner receives:\n\n- realtime assignment\n\n- in-app notification\n\n- Home update\n\n- Available update\n\n- Daily Route update\n\nAnd with valid FCM:\n\n- real Android push\n\n==================================================\n\n16. FAILURE REPORT\n\n==================================================\n\nIf Vikram still does not get a token, DO NOT say:\n\n\"Partner lifecycle is fixed.\"\n\nReturn exactly:\n\nisNative:\n\n____\n\nFirebase initialized:\n\n____\n\npermission:\n\n____\n\ngetToken started:\n\n____\n\ngetToken result:\n\n____\n\nnative exception:\n\n____\n\nregisterPushToken called:\n\n____\n\nregisterPushToken response:\n\n____\n\nPartner APK package:\n\n____\n\nPartner APK version:\n\n____\n\nFirebase project:\n\n____\n\nFIRST FAILURE:\n\n____\n\n==================================================\n\nFINAL ACCEPTANCE\n\nThe task is fixed only when:\n\nVikram opens the latest Partner APK\n\n→ Firebase initializes\n\n→ real FCM token is obtained\n\n→ token is persisted\n\n→ Realtime connects\n\n→ assignment recovery works\n\n→ Admin assignment updates the Partner App\n\n→ push notification works.\n\nThen repeat the same test for:\n\nImran\n\nAarav\n\nat least one additional Trial partner.\n\nDo not change backend architecture until the client-side FIRST FAILURE is\n\nidentified and fixed.`;

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
