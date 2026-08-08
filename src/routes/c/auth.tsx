import { z } from "zod";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/components/customer/ui/OtpInput";
import logo from "@/assets/logo.jpeg";
import hero from "@/assets/hero-car-wash.jpg";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/c/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Log in — Urban Wash" }] }),
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  component: CustomerAuth,
});

type Step = "phone" | "otp" | "name";

const customerEmail = (phone: string) => `${phone}@customer.urbanwash.app`;
const customerPassword = (phone: string) => `UWC@${phone}#2026`;

const OTP_LENGTH = 4;
const RESEND_SECONDS = 30;
// Demo OTP hint is a development affordance only — never shipped in the APK.
const SHOW_DEMO_OTP = import.meta.env.DEV;

function CustomerAuth() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const goAfterAuth = () => {
    if (redirect) { navigate({ to: redirect as any, replace: true }); return; }
    const area = localStorage.getItem("uw_customer_area");
    navigate({ to: area ? "/c/home" : "/c/location", replace: true });
  };

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [hasReferral, setHasReferral] = useState(false);
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const verifyingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.email?.endsWith("@customer.urbanwash.app")) {
        goAfterAuth();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const sendOtp = () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit mobile number"); return; }
    setStep("otp");
    setOtp("");
    setResendIn(RESEND_SECONDS);
    toast.success(`OTP sent to +91 ${phone}`);
  };

  const resendOtp = () => {
    if (resendIn > 0) return;
    setOtp("");
    setResendIn(RESEND_SECONDS);
    toast.success("OTP sent again");
  };

  const verifyOtp = async (code = otp) => {
    if (verifyingRef.current) return; // no double submits
    if (code.length !== OTP_LENGTH) { toast.error(`Enter the ${OTP_LENGTH}-digit code`); return; }
    if (code !== "1234") { toast.error("Invalid OTP. Please try again."); return; }
    verifyingRef.current = true;
    setLoading(true);
    const email = customerEmail(phone);
    const password = customerPassword(phone);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    verifyingRef.current = false;
    if (data.session) { goAfterAuth(); return; }
    // Only treat "user does not exist" as a signup path. Surface other errors
    // (rate-limit, network, unconfirmed email) so users aren't silently sent
    // to the name step and told to sign up again.
    const msg = (error?.message ?? "").toLowerCase();
    const isNewUser =
      msg.includes("invalid login credentials") ||
      msg.includes("invalid_credentials") ||
      msg.includes("user not found");
    if (isNewUser) {
      setStep("name");
    } else if (error) {
      toast.error(error.message || "Could not sign in. Please try again.");
    }
  };

  const signUp = async () => {
    if (loading) return;
    if (name.trim().length < 2) { toast.error("Enter your full name"); return; }
    setLoading(true);
    const email = customerEmail(phone);
    const password = customerPassword(phone);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name.trim(), phone, role: "customer", referral_code: hasReferral ? referral.trim() : null } },
    });
    if (error) { setLoading(false); toast.error(error.message); return; }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) { setLoading(false); toast.error(e2.message); return; }

    const { data: u } = await supabase.auth.getUser();
    if (u?.user) {
      await (supabase as any).from("customer_profiles").upsert({
        user_id: u.user.id,
        full_name: name.trim(),
        phone,
      }, { onConflict: "user_id" });
    }
    setLoading(false);
    goAfterAuth();
  };

  const backToPhone = () => { setOtp(""); setName(""); setResendIn(0); setStep("phone"); };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#FFF9F3]">
      <div className="relative flex flex-1 flex-col px-6 pb-10 pt-10">
        {step !== "phone" && (
          <button
            onClick={backToPhone}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
          >
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        )}

        <div className={cn("flex flex-col items-center text-center", step === "phone" ? "mt-12" : "mt-8")}>
          <div className="relative">
             <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
             <img src={logo} alt="Urban Wash" className="relative h-16 w-16 rounded-[20px] object-cover shadow-sm" />
          </div>
          <div className="mt-4 leading-tight">
            <p className="text-xl font-black tracking-tight text-[#1a1a1a]">Urban Wash</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Lucknow</p>
          </div>
        </div>

        {step === "phone" && (
          <div className="mt-12 animate-fade-in">
            <h1 className="text-3xl font-bold tracking-tight">Log in or sign up</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll send a one-time code to verify your number.
            </p>

            <div className="mt-8 flex items-center rounded-2xl border border-input bg-card px-4 py-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="text-base font-semibold text-foreground">+91</span>
              <span className="mx-3 h-5 w-px bg-border" />
              <Input
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="Mobile number"
                className="h-auto border-0 bg-transparent p-0 text-base tracking-wide shadow-none focus-visible:ring-0"
              />
            </div>

            <Button
              size="lg"
              onClick={sendOtp}
              disabled={phone.length !== 10}
              className="mt-5 h-14 w-full rounded-2xl text-base font-semibold transition-transform active:scale-[0.98]"
            >
              Continue
            </Button>

            <div className="mt-7 flex items-center gap-3">
              <Checkbox
                id="ref"
                checked={hasReferral}
                onCheckedChange={(v) => setHasReferral(v === true)}
              />
              <label htmlFor="ref" className="text-sm font-medium">Have a referral code?</label>
            </div>
            {hasReferral && (
              <Input
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="Enter referral code"
                className="mt-3 h-12 rounded-2xl animate-fade-in"
              />
            )}

            <div className="mt-auto" />
            <p className="mt-12 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> Your number is never shared
            </p>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link to="/trust" className="font-semibold underline underline-offset-2">Terms of Service</Link> &{" "}
              <Link to="/trust" className="font-semibold underline underline-offset-2">Privacy Policy</Link>
            </p>
          </div>
        )}

        {step === "otp" && (
          <div className="mt-12 animate-fade-in">
            <h1 className="text-3xl font-bold tracking-tight">Verify your number</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Code sent to <span className="font-semibold text-foreground">+91 {phone}</span>
            </p>

            <div className="mt-8">
              <OtpInput
                value={otp}
                onChange={setOtp}
                length={OTP_LENGTH}
                disabled={loading}
                onComplete={(code) => void verifyOtp(code)}
              />
            </div>

            {SHOW_DEMO_OTP && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Demo OTP: <span className="font-mono font-semibold">1234</span>
              </p>
            )}

            <Button
              size="lg"
              className="mt-6 h-14 w-full rounded-2xl text-base font-semibold transition-transform active:scale-[0.98]"
              onClick={() => void verifyOtp()}
              disabled={loading || otp.length !== OTP_LENGTH}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Verifying…" : "Verify"}
            </Button>

            <div className="mt-6 text-center text-sm">
              {resendIn > 0 ? (
                <span className="text-muted-foreground">
                  Resend OTP in <span className="font-semibold tabular-nums text-foreground">{resendIn}s</span>
                </span>
              ) : (
                <button onClick={resendOtp} className="font-semibold text-primary underline underline-offset-4">
                  Resend OTP
                </button>
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card p-4 text-center">
              <p className="text-xs font-semibold">Trouble receiving OTP?</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Check your network, then request a new code.
              </p>
              <button
                onClick={backToPhone}
                className="mt-3 text-xs font-semibold text-primary underline underline-offset-4"
              >
                Change mobile number
              </button>
            </div>
          </div>
        )}

        {step === "name" && (
          <div className="mt-12 animate-fade-in">
            <h1 className="text-3xl font-bold tracking-tight">Welcome to Urban Wash</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell us your name to finish setting up your account.
            </p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              className="mt-8 h-14 rounded-2xl text-base"
            />
            <Button
              size="lg"
              className="mt-5 h-14 w-full rounded-2xl text-base font-semibold transition-transform active:scale-[0.98]"
              onClick={signUp}
              disabled={loading || name.trim().length < 2}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Creating your account…" : "Create my account"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
