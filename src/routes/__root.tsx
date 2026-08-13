import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "../lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/components/customer/AuthProvider";
import { installCameraRouteRestore } from "@/lib/cameraRestore";
import { installPartnerRuntimeInstrumentation } from "@/lib/partner-runtime-instrumentation";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[ROOT-ERROR]", error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const isDev = import.meta.env.MODE === 'development';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        
        {isDev && (
          <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-left overflow-auto max-h-[300px]">
             <p className="text-[10px] font-mono text-muted-foreground uppercase mb-1">BUILD: FCM-P0-ANDROID-RECEIPT-02</p>
             <p className="text-xs font-bold text-destructive">{error.name}: {error.message}</p>
             {error.stack && (
               <pre className="mt-2 text-[10px] font-mono text-muted-foreground leading-tight">
                 {error.stack.split('\n').slice(0, 8).join('\n')}
               </pre>
             )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={() => {
              // Isolated Customer/Partner Home logic
              const path = window.location.pathname;
              if (path.startsWith('/c/')) {
                router.navigate({ to: '/c/home' });
              } else if (path.startsWith('/auth') || path.startsWith('/partner') || path.startsWith('/app')) {
                router.navigate({ to: '/auth' }); // Correct partner start
              } else {
                router.navigate({ to: '/' });
              }
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "urban wash partner" },
      { name: "description", content: "Urban Wash Partner App enables car care partners to manage daily cleaning services, track earnings, and onboard new customers." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "urban wash partner" },
      { property: "og:description", content: "Urban Wash Partner App enables car care partners to manage daily cleaning services, track earnings, and onboard new customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "urban wash partner" },
      { name: "twitter:description", content: "Urban Wash Partner App enables car care partners to manage daily cleaning services, track earnings, and onboard new customers." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/MCVapbCo5XbPjsDOUeq7WwZlIHX2/social-images/social-1781118455783-LOGO.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/MCVapbCo5XbPjsDOUeq7WwZlIHX2/social-images/social-1781118455783-LOGO.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <div id="root" />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installPartnerRuntimeInstrumentation(queryClient);
  }, [queryClient]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[ROOT-AUTH] Event:", event, "Session:", session?.user?.id);
      
      // Only invalidate on actual auth boundary changes, not on every check or navigation-related event
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        console.log("[ROOT-AUTH] Major auth change, invalidating all queries");
        void queryClient.invalidateQueries();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => installCameraRouteRestore(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster richColors position="top-center" />
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
