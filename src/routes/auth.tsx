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
  head: () => ({ meta: [{ title: "Partner Login — Urban Wash" }] }),
  component: AuthPage,
});

type Step = "phone" | "otp" | "name";

function phoneEmail(phone: string) {
  return `${phone}@partner.urbanwash.app`;
}
function phonePassword(phone: string) {
  return `UW@${phone}#2026`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit phone"); return; }
    setStep("otp");
    toast.success("OTP sent. Use 1234 to continue (demo)");
  };

  const verifyOtp = async () => {
    if (otp !== "1234") { toast.error("Invalid OTP. Use 1234"); return; }
    setLoading(true);
    const email = phoneEmail(phone);
    const password = phonePassword(phone);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data.session) {
      setLoading(false);
      navigate({ to: "/app" });
      return;
    }
    // First time → ask name
    setLoading(false);
    if (error) setStep("name");
  };

  const signUp = async () => {
    if (name.trim().length < 2) { toast.error("Enter your full name"); return; }
    setLoading(true);
    const email = phoneEmail(phone);
    const password = phonePassword(phone);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name.trim(), phone } },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    // Try sign in
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) { toast.error(e2.message); return; }
    navigate({ to: "/app" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col px-6 pt-10">
        <button onClick={() => navigate({ to: "/" })} className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-10">
          <img src={logo} alt="Urban Wash" className="h-14 w-14 rounded-2xl object-cover" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Partner login</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {step === "phone" && "We'll send a one-time password to your phone."}
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
            <Button size="lg" className="w-full" onClick={sendOtp}>Send OTP</Button>
            <p className="text-xs text-muted-foreground">By continuing, you agree to Urban Wash Partner terms.</p>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="otp">4-digit code</Label>
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
            <Button size="lg" className="w-full" onClick={signUp} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create partner account
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
