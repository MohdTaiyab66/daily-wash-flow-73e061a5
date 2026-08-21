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

  const replacementText = `'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            URBAN WASH — P0 UNIVERSAL PARTNER PARITY — ALL PARTNERS, OLD + NEW\n\nIMPORTANT:\n\nThe previous verification tested only a few partners:\n\n- Deepak\n\n- Aarav\n\n- Vikram\n\n- one future partner\n\nBUT Urban Wash has MANY MORE partner accounts.\n\nThis is NOT sufficient.\n\nThe requirement is:\n\nEVERY CURRENT PARTNER\n\n+\n\nEVERY FUTURE PARTNER\n\nmust use the SAME technical infrastructure and SAME lifecycle.\n\nDo not make partner-specific fixes.\n\nDo not manually repair individual partners.\n\n==================================================\n\n1. DISCOVER ALL PARTNERS\n\n==================================================\n\nFirst query the authoritative partner source:\n\npublic.partners\n\nGet EVERY partner account.\n\nDo NOT manually use only:\n\nDeepak\n\nAarav\n\nVikram\n\nImran\n\nThe system must include ALL current partners.\n\nReturn:\n\ntotal_partner_count\n\nand a complete partner inventory with:\n\npartner_id\n\nname\n\nphone\n\npartner type\n\nactive/inactive\n\napproved/pending\n\nhome_area\n\nhome_zone_id\n\nInclude Trial AND Real partners.\n\n==================================================\n\n2. UNIVERSAL LIFECYCLE\n\n==================================================\n\nEvery partner must use exactly the same technical lifecycle:\n\nLOGIN\n\n↓\n\nAUTH SESSION\n\n↓\n\nRESOLVE PARTNER IDENTITY\n\n↓\n\nREGISTER REAL FCM TOKEN\n\n↓\n\nCONNECT REALTIME\n\n↓\n\nINITIAL DATABASE SYNC\n\n↓\n\nLOAD ASSIGNMENTS\n\n↓\n\nLOAD NOTIFICATIONS\n\n↓\n\nLOAD TODAY ROUTE\n\n↓\n\nLOAD EARNINGS\n\n↓\n\nLISTEN FOR FUTURE ASSIGNMENTS\n\nNo partner may bypass any of these steps because of:\n\ntrial\n\nreal\n\nold account\n\nnew account\n\nphone number\n\npartner ID\n\napproval type\n\n==================================================\n\n3. REMOVE PARTNER-SPECIFIC LOGIC\n\n==================================================\n\nSearch the ENTIRE codebase for:\n\nDeepak\n\n9000000006\n\nAarav\n\nVikram\n\nImran\n\nAlso search:\n\nis_trial\n\ntrial\n\nTRIAL-FCM\n\ndummy token\n\nmock token\n\npartner_type\n\nspecial partner\n\nspecific partner_id\n\nThere must be NO technical behavior based on individual partner identity\n\nor trial/real classification.\n\nBusiness permissions may differ.\n\nTechnical infrastructure must NOT.\n\n==================================================\n\n4. FCM FOR ALL PARTNERS\n\n==================================================\n\nFor EVERY partner who logs into the latest Partner APK:\n\nobtain REAL Firebase FCM token\n\n→ store in push_tokens\n\n→ active = true\n\n→ app_type = partner\n\n→ platform = android\n\n→ update timestamp\n\nNo fake tokens.\n\nNo TRIAL-FCM.\n\nNo manually inserted tokens.\n\nIf a partner has never logged in:\n\n0 tokens is acceptable before first login.\n\nAfter first login:\n\ntoken must be created automatically.\n\n==================================================\n\n5. REALTIME FOR ALL PARTNERS\n\n==================================================\n\nEvery authenticated partner must establish:\n\nSupabase Realtime = SUBSCRIBED\n\nThe Partner App must not rely on Deepak's working state.\n\nOn login:\n\ninitial DB synchronization FIRST\n\nthen realtime subscription\n\nCorrect lifecycle:\n\nLOGIN\n\n→ INITIAL SYNC\n\n→ UI CURRENT\n\n→ REALTIME CONNECTED\n\nThis prevents missed assignments.\n\n==================================================\n\n6. ASSIGNMENT RECOVERY\n\n==================================================\n\nFor EVERY partner:\n\nIf Admin assigns a booking while the partner is:\n\noffline\n\nlogged out\n\napp closed\n\nthen on the next login/open:\n\nassignment MUST be recovered from the database.\n\nDo not rely on the original realtime event.\n\n==================================================\n\n7. ADMIN ASSIGNMENT\n\n==================================================\n\nAdmin must be able to assign a Daily Shine booking to ANY valid eligible\n\npartner from the complete partner list.\n\nTrial or Real does not matter technically.\n\nAfter assignment:\n\nassignment DB\n\n→ partner notification\n\n→ realtime\n\n→ Partner App\n\nmust follow the same code path for every partner.\n\n==================================================\n\n8. PARTNER APP SYNC\n\n==================================================\n\nAfter Admin assigns ANY partner:\n\nwithout manual refresh:\n\nHome updates\n\nAvailable updates\n\nDaily Route updates\n\nMap updates\n\nNotifications update\n\nAssignment count updates\n\nEarning potential updates\n\nThe same authoritative assignment record must be used.\n\n==================================================\n\n9. PUSH\n\n==================================================\n\nIf the partner has a valid token:\n\nsend real Android push.\n\nIf push fails:\n\nassignment still updates through:\n\ndatabase\n\n+\n\ninitial sync\n\n+\n\nrealtime\n\nPush must never be the source of truth.\n\n==================================================\n\n10. FULL CURRENT PARTNER AUDIT\n\n==================================================\n\nDo NOT only test 3–4 partners.\n\nGenerate an audit for ALL current partners.\n\nFor each partner report:\n\npartner_id\n\nname\n\ntype\n\nFCM token present\n\nactive token\n\nRealtime status\n\nlast_seen\n\ninitial sync\n\ncurrent active assignment count\n\nnotification count\n\nClassify:\n\nREADY\n\nTOKEN MISSING\n\nREALTIME OFFLINE\n\nLOGIN REQUIRED\n\nDATA ERROR\n\nThis is an inventory/diagnostic report, NOT a reason to manually alter each\n\nrow.\n\n==================================================\n\n11. AUTOMATIC FIRST-LOGIN BEHAVIOR\n\n==================================================\n\nFor every partner currently marked:\n\nTOKEN MISSING\n\nthe system must recover automatically when they next open/login to the latest\n\nPartner APK.\n\nDo NOT require:\n\nSQL insert\n\nmanual token insertion\n\nadmin intervention\n\ndeveloper intervention\n\n==================================================\n\n12. NEW PARTNER TEST\n\n==================================================\n\nCreate one brand-new partner account.\n\nLogin using latest APK.\n\nExpected automatically:\n\nFCM token\n\nRealtime SUBSCRIBED\n\ninitial sync\n\nnotifications\n\nHome\n\nDaily Route\n\nEarnings\n\nThen Admin assigns a booking.\n\nVerify the same flow as an existing partner.\n\n==================================================\n\n13. BULK PARITY TEST\n\n==================================================\n\nUse a representative sample from:\n\n- existing Real partners\n\n- existing Trial partners\n\n- newly created partner\n\nBut ALSO run a complete database audit across ALL partner accounts.\n\nThe sample proves runtime behavior.\n\nThe full inventory proves there are no hidden partner-specific exceptions.\n\n==================================================\n\n14. PARTNER AREA\n\n==================================================\n\nEvery partner should use the same authoritative:\n\nhome_area\n\nhome_zone_id\n\nlogic.\n\nIf a valid area exists:\n\ndisplay it.\n\nIf genuinely missing:\n\nAREA NOT ASSIGNED\n\nDo NOT let a missing area lookup silently become:\n\n\"No area\"\n\nand do NOT create fake zone values.\n\n==================================================\n\n15. FINAL PARTNER POPULATION REPORT\n\n==================================================\n\nReturn:\n\nTOTAL PARTNERS = N\n\nREAL PARTNERS = N\n\nTRIAL PARTNERS = N\n\nOTHER/NEW = N\n\nThen list every partner grouped by:\n\nREADY\n\nLOGIN REQUIRED\n\nTOKEN MISSING\n\nREALTIME OFFLINE\n\nDATA ERROR\n\nDo NOT assume partners with 0 tokens are broken if they have never logged in.\n\n==================================================\n\n16. FINAL ACCEPTANCE\n\n==================================================\n\nThe system must guarantee:\n\nALL CURRENT PARTNERS\n\n+\n\nALL FUTURE PARTNERS\n\nautomatically receive the same technical lifecycle:\n\nFCM\n\nRealtime\n\nInitial Sync\n\nAssignment Recovery\n\nIn-App Notifications\n\nHome\n\nAvailable\n\nDaily Route\n\nMap\n\nEarnings\n\nPush\n\nThe only difference allowed between partners is BUSINESS eligibility or\n\npermissions.\n\nThere must be ZERO technical special treatment for:\n\nDeepak\n\nAarav\n\nVikram\n\nImran\n\nTrial partners\n\nReal partners\n\nMOST IMPORTANT:\n\nDo NOT just make the four tested partners work.\n\nMake the implementation UNIVERSAL for the ENTIRE public.partners population\n\nand for every partner account created in the future.\n\nThen perform a complete partner inventory audit and report the total count and\n\nstatus of ALL partners.`;

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
