import { createFileRoute } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { MapPin, Shield, Star, Clock, Sparkles, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">URBAN WASH</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost">Partner Login</Button>
            </Link>
            <Button>Download App</Button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="py-20 lg:py-32 container mx-auto px-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Star className="w-4 h-4 fill-current" />
              <span>Premium Doorstep Car Wash in Kanpur</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight">
              Your car deserves a <span className="text-primary">Daily Shine.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl">
              Professional, eco-friendly car cleaning service delivered at your doorstep every morning. Join thousands of happy car owners in Kanpur.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="h-14 px-8 text-lg font-semibold">
                Start 7-Day Free Trial
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-semibold">
                View Pricing
              </Button>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Clock,
                  title: "Early Morning Service",
                  description: "We clean your car before you head out for work, every single day."
                },
                {
                  icon: Shield,
                  title: "Verified Professionals",
                  description: "Our partners are background-checked and professionally trained."
                },
                {
                  icon: MapPin,
                  title: "Real-time Tracking",
                  description: "Track your wash status and get photos of every completed service."
                }
              ].map((feature, i) => (
                <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                    <feature.icon className="text-primary w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="py-20 container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">Trusted by Kanpur's best neighborhoods</h2>
          <div className="flex flex-wrap justify-center gap-8 opacity-50 grayscale">
            <div className="text-xl font-bold">Kalyanpur</div>
            <div className="text-xl font-bold">Indira Nagar</div>
            <div className="text-xl font-bold">Awas Vikas</div>
            <div className="text-xl font-bold">Sharda Nagar</div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 mt-20">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 Urban Wash. All rights reserved.</p>
          <div className="mt-8 text-[10px] text-muted-foreground/20 max-w-xs mx-auto text-left whitespace-pre-wrap font-mono pointer-events-none select-none">
            {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            For the code present, I get the error below.

Please think step-by-step in order to resolve it.
\`\`\`
# Error number 1:
#################

The app returned 500 while handling GET /. The error was handled by a route or error boundary, so no stack was captured — check the failing loader/route code and the dev server output.

{
  "timestamp": 1787401141261,
  "error_type": "RUNTIME_ERROR",
  "filename": "Unknown file",
  "lineno": 0,
  "colno": 0,
  "stack": "Unavailable",
  "has_blank_screen": true
}

# Error number 2:
#################

TypeError: __vite_ssr_import_5__.Route.update is not a function

{
  "timestamp": 1787401175565,
  "error_type": "RUNTIME_ERROR",
  "filename": "Unknown file",
  "lineno": 0,
  "colno": 0,
  "stack": "TypeError: __vite_ssr_import_5__.Route.update is not a function\\n    at eval (/dev-server/src/routeTree.gen.ts:126:37)\\n    at async ESModulesEvaluator.runInlinedModule (file:///dev-server/node_modules/vite/dist/node/module-runner.js:913:3)\\n    at async ModuleRunner.directRequest (file:///dev-server/node_modules/vite/dist/node/module-runner.js:1146:59)\\n    at async ModuleRunner.cachedRequest (file:///dev-server/node_modules/vite/dist/node/module-runner.js:1053:73)\\n    at async eval (/dev-server/src/router.tsx:3:1)\\n    at async ESModulesEvaluator.runInlinedModule (file:///dev-server/node_modules/vite/dist/node/module-runner.js:913:3)\\n    at async ModuleRunner.directRequest (file:///dev-server/node_modules/vite/dist/node/module-runner.js:1146:59)\\n    at async ModuleRunner.cachedRequest (file:///dev-server/node_modules/vite/dist/node/module-runner.js:1053:73)\\n    at async Promise.all (index 0)\\n    at async loadEntries (/dev-server/node_modules/@tanstack/start-server-core/src/createStartHandler.ts:235:53)\",
  "has_blank_screen": true
}
\`\`\``}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Route;
