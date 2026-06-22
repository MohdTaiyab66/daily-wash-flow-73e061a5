import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, Lock, Database, Eye, Mail, FileCheck } from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Security — Urban Wash" },
      { name: "description", content: "How Urban Wash protects your account, your data, and your privacy." },
      { property: "og:title", content: "Trust & Security — Urban Wash" },
      { property: "og:description", content: "How Urban Wash protects your account, your data, and your privacy." },
    ],
  }),
  component: TrustPage,
});

function Section({ icon: Icon, title, children }: { icon: typeof Shield; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="mb-3 flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Home</Link>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Trust &amp; Security</h1>
        <p className="mt-3 text-base text-muted-foreground">
          This page is maintained by Urban Wash to answer common security and privacy questions about the
          Urban Wash partner and customer apps. It describes the controls currently enabled in the product
          and is not an independent certification.
        </p>

        <div className="mt-10 grid gap-4">
          <Section icon={Lock} title="Sign-in &amp; account access">
            <p>Partners and customers sign in with a one-time code delivered by SMS to their phone number. Codes are validated server-side; no password is ever derived from public information.</p>
            <p>Sessions are managed by the auth provider and stored only in the device's browser storage.</p>
          </Section>

          <Section icon={Shield} title="Authorization">
            <p>Administrative actions are gated by a server-side role check (a dedicated user-roles table). Client-side flags never grant access on their own.</p>
            <p>Database row-level rules ensure partners only see customers tied to their current and upcoming assignments, and customers only see their own bookings, addresses, vehicles, and complaints.</p>
          </Section>

          <Section icon={Database} title="Data storage">
            <p>App data is stored in a managed Postgres database with row-level security enabled on every customer-facing table.</p>
            <p>Service photos and uploads are stored in scoped buckets; access is granted via short-lived signed URLs where applicable.</p>
          </Section>

          <Section icon={Eye} title="What we collect">
            <p>Account: phone number, name, and (for partners) onboarding details required to operate.</p>
            <p>Service: addresses, vehicle details, scheduled times, and photos taken during a wash.</p>
            <p>Usage: minimal logs for security and reliability. We don't use third-party advertising trackers.</p>
          </Section>

          <Section icon={FileCheck} title="Subprocessors">
            <p>We rely on Supabase (managed Postgres, Auth, Storage) and Google Maps Platform (location lookups and routing). Payment processing, when enabled, is handled by Razorpay.</p>
          </Section>

          <Section icon={Mail} title="Reporting a security issue">
            <p>If you believe you've found a vulnerability, please email <a className="text-primary underline" href="mailto:security@urbanwash.app">security@urbanwash.app</a>. We acknowledge reports within 3 business days.</p>
          </Section>
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Last reviewed by Urban Wash. The information above reflects controls currently enabled in the app and
          may evolve as the product changes.
        </p>
      </div>
    </div>
  );
}
