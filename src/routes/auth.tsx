import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import logo from "@/assets/logo.jpeg";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Partner Login — Urban Wash" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" && search.redirect.startsWith("/") ? search.redirect : undefined,
  }),
  component: AuthPage,
});

type Step = "phone" | "otp" | "name";

// Phone-as-email pattern (phone provider is disabled on this project).
const partnerEmail = (phone: string) => `${phone}@partner.urbanwash.app`;
const adminEmail = (phone: string) => `${phone}@admin.urbanwash.app`;
const partnerPassword = (phone: string) => `UWP@${phone}#2026`;

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const nextRoute = redirect?.startsWith("/admin") ? "/admin" : "/app";
  const isAdminLogin = nextRoute === "/admin";
  const emailFor = (p: string) => (isAdminLogin ? adminEmail(p) : partnerEmail(p));

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
        return;
      }
      const email = data.user?.email || "";
      if (isAdminLogin && email.endsWith("@admin.urbanwash.app")) navigate({ to: "/admin" });
      else if (!isAdminLogin && email.endsWith("@partner.urbanwash.app")) navigate({ to: "/app" });
    })();
  }, [isAdminLogin, navigate]);

  const ensureStaffRole = async (role: "admin" | "partner", fullName?: string) => {
    const { data, error } = await supabase.rpc("ensure_staff_login_role" as any, {
      p_role: role,
      p_full_name: fullName || null,
    });
    if (error || !data) throw new Error(error?.message || `${role === "admin" ? "Admin" : "Partner"} access is not enabled for this phone`);
  };

  const sendOtp = () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit phone"); return; }
    setStep("otp");
    toast.success("OTP sent. Use 1234 to continue (demo)");
  };

  const verifyOtp = async () => {
    if (otp !== "1234") { toast.error("Invalid OTP. Use 1234"); return; }
    setLoading(true);
    try {
      const email = emailFor(phone);
      const password = partnerPassword(phone);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.session) {
      // Existing account – check profile completeness for partners
        if (!isAdminLogin) {
          const uid = data.session.user.id;
          const { data: partner } = await supabase.from("partners").select("full_name").eq("id", uid).maybeSingle();
          if (!partner?.full_name) { setLoading(false); setStep("name"); return; }
          try {
            await ensureStaffRole("partner", partner.full_name);
          } catch (e: any) {
            toast.error(e.message || "Partner access is not enabled for this phone");
            return;
          }
        } else {
          try {
            await ensureStaffRole("admin");
          } catch (e: any) {
            toast.error(e.message || "Admin access is not enabled for this phone");
            return;
          }
        }
        navigate({ to: nextRoute });
        return;
      }
      if (error) setStep("name");
    } catch (e: any) {
      toast.error(e?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) { toast.error("Enter your full name"); return; }
    setLoading(true);
    const email = emailFor(phone);
    const password = partnerPassword(phone);
    const role = isAdminLogin ? "admin" : "partner";

    // Try sign-up; if account exists, sign in.
    const { error: signUpErr } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name.trim(), phone, role } },
    });
    if (signUpErr && !/already|registered|exists/i.test(signUpErr.message)) {
      setLoading(false); toast.error(signUpErr.message); return;
    }
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr || !signInData.session) {
      setLoading(false); toast.error(signInErr?.message || "Could not sign in"); return;
    }

    await supabase.auth.updateUser({ data: { full_name: name.trim(), phone, role } });

    try {
      await ensureStaffRole(role as "admin" | "partner", name.trim());
    } catch (e: any) {
      setLoading(false);
      toast.error(e.message || "Access is not enabled for this phone");
      return;
    }

    setLoading(false);
    navigate({ to: nextRoute });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col px-6 pt-10">
        <button onClick={() => navigate({ to: "/" })} className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-10">
          <img src={logo} alt="Urban Wash" className="h-14 w-14 rounded-2xl object-cover" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">{isAdminLogin ? "Admin login" : "Partner login"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === "phone" && "We'll text you a one-time password."}
            {step === "otp" && `Enter the 4-digit code sent to +91 ${phone}.`}
            {step === "name" && "Welcome! Tell us your name to finish signing up."}
          </p>
        </div>

        {step === "phone" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="phone">Phone number</Label>
              <div className="mt-2 flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">+91</span>
                <Input id="phone" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98765 43210" className="rounded-l-none" />
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={sendOtp} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send OTP
            </Button>
            <p className="text-xs text-muted-foreground">By continuing, you agree to Urban Wash {isAdminLogin ? "Admin" : "Partner"} terms.</p>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="otp">Verification code</Label>
              <Input id="otp" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} className="mt-2 text-center text-2xl tracking-[0.5em]" />
              <p className="mt-2 text-xs text-muted-foreground">Demo OTP: <span className="font-mono">1234</span></p>
            </div>
            <Button size="lg" className="w-full" onClick={verifyOtp} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify
            </Button>
            <button className="text-xs text-muted-foreground underline" onClick={() => setStep("phone")}>Change number</button>
          </div>
        )}

        {step === "name" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi Kumar" className="mt-2" />
            </div>
            <Button size="lg" className="w-full" onClick={saveName} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
