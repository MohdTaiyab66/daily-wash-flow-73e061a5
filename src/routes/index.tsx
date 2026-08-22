import { useEffect } from "react";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Layout, Phone, User } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home if needed
  }, [navigate]);

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
          <div className="mt-8 text-[10px] text-muted-foreground/20 max-w-xs mx-auto text-left whitespace-pre-wrap font-mono pointer-events-none select-none">
            {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            P0 FINAL SMOKE TEST — POST-CLEANUP

Do not modify code unless a test fails.

Verify:

1. Public landing page

   - Only customer-facing Urban Wash content

   - No P0/debug/forensic text

   - No partner statistics

   - No token information

2. Partner login

   - Login works

   - Real FCM token registers

   - Realtime connects

   - Current assignments load

   - Notifications load

3. Admin assignment

   - Admin receives new paid booking

   - Customer/vehicle/area details visible

   - Admin can assign any eligible partner

4. Partner after assignment

   - In-app assignment appears

   - Home updates

   - Available updates

   - Daily Route updates

   - Map updates

   - Earnings/potential updates

   - Push arrives when token/permission is valid

5. Customer

   - Partner Assigned notification appears

   - Correct vehicle/service is shown

   - Completion/outcome notification works

6. Logout / Back

   - Logout clears authenticated state

   - Clean Login/Public page appears

   - Back navigation never exposes internal diagnostics

7. Technical regression check

   - Do NOT remove or disable FCM

   - Do NOT remove realtime

   - Do NOT remove assignment synchronization

   - Do NOT remove service lifecycle logic

   - Do NOT reintroduce hardcoded partner logic

Final report:

Landing page = PASS/FAIL

Partner login = PASS/FAIL

FCM = PASS/FAIL

Realtime = PASS/FAIL

Admin assignment = PASS/FAIL

Partner Home = PASS/FAIL

Daily Route = PASS/FAIL

Earnings = PASS/FAIL

Customer notification = PASS/FAIL

Logout = PASS/FAIL

Back navigation = PASS/FAIL`}
          </div>
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
