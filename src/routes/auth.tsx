import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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

function toE164(phone: string) {
  return `+91${phone}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const nextRoute = redirect?.startsWith("/admin") ? "/admin" : "/app";
  const isAdminLogin = nextRoute === "/admin";
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit phone"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      phone: toE164(phone),
      options: { channel: "sms" },
    });
    setLoading(false);
    if (error) { toast.error(error.message || "Could not send OTP"); return; }
    setStep("otp");
    toast.success("OTP sent to your phone");
  };

  const verifyOtp = async () => {
    if (!/^\d{4,6}$/.test(otp)) { toast.error("Enter the OTP from your SMS"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      phone: toE164(phone),
      token: otp,
      type: "sms",
    });
    if (error || !data.session) {
      setLoading(false);
      toast.error(error?.message || "Invalid or expired OTP");
      return;
    }
    // Check if partner profile already has a name
    const userId = data.session.user.id;
    const { data: partner } = await supabase
      .from("partners")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    setLoading(false);
    if (!partner?.full_name) {
      setStep("name");
    } else {
      navigate({ to: nextRoute });
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) { toast.error("Enter your full name"); return; }
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); toast.error("Session expired, please sign in again"); setStep("phone"); return; }
    await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    const { error } = await supabase
      .from("partners")
      .update({ full_name: name.trim() })
      .eq("id", uid);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
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
            {step === "phone" && "We'll send a one-time password to your phone."}
            {step === "otp" && `Enter the code sent to +91 ${phone}.`}
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
              <Input id="otp" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} className="mt-2 text-center text-2xl tracking-[0.5em]" />
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
