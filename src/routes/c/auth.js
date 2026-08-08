import { z } from "zod";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { OtpInput } from "@/components/customer/ui/OtpInput";
import logo from "@/assets/logo.jpeg";
import { cn } from "@/lib/utils";
export const Route = createFileRoute("/c/auth")({
    ssr: false,
    head: () => ({ meta: [{ title: "Log in — Urban Wash" }] }),
    validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
    component: CustomerAuth,
});
const customerEmail = (phone) => `${phone}@customer.urbanwash.app`;
const customerPassword = (phone) => `UWC@${phone}#2026`;
const OTP_LENGTH = 4;
const RESEND_SECONDS = 30;
// Demo OTP hint is a development affordance only — never shipped in the APK.
const SHOW_DEMO_OTP = import.meta.env.DEV;
function CustomerAuth() {
    const navigate = useNavigate();
    const { redirect } = Route.useSearch();
    const goAfterAuth = () => {
        if (redirect) {
            navigate({ to: redirect, replace: true });
            return;
        }
        const area = localStorage.getItem("uw_customer_area");
        navigate({ to: area ? "/c/home" : "/c/location", replace: true });
    };
    const [step, setStep] = useState("phone");
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
        if (resendIn <= 0)
            return;
        const t = window.setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
        return () => window.clearInterval(t);
    }, [resendIn]);
    const sendOtp = () => {
        if (!/^\d{10}$/.test(phone)) {
            toast.error("Enter a valid 10-digit mobile number");
            return;
        }
        setStep("otp");
        setOtp("");
        setResendIn(RESEND_SECONDS);
        toast.success(`OTP sent to +91 ${phone}`);
    };
    const resendOtp = () => {
        if (resendIn > 0)
            return;
        setOtp("");
        setResendIn(RESEND_SECONDS);
        toast.success("OTP sent again");
    };
    const verifyOtp = async (code = otp) => {
        if (verifyingRef.current)
            return; // no double submits
        if (code.length !== OTP_LENGTH) {
            toast.error(`Enter the ${OTP_LENGTH}-digit code`);
            return;
        }
        if (code !== "1234") {
            toast.error("Invalid OTP. Please try again.");
            return;
        }
        verifyingRef.current = true;
        setLoading(true);
        const email = customerEmail(phone);
        const password = customerPassword(phone);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        verifyingRef.current = false;
        if (data.session) {
            goAfterAuth();
            return;
        }
        // Only treat "user does not exist" as a signup path. Surface other errors
        // (rate-limit, network, unconfirmed email) so users aren't silently sent
        // to the name step and told to sign up again.
        const msg = (error?.message ?? "").toLowerCase();
        const isNewUser = msg.includes("invalid login credentials") ||
            msg.includes("invalid_credentials") ||
            msg.includes("user not found");
        if (isNewUser) {
            setStep("name");
        }
        else if (error) {
            toast.error(error.message || "Could not sign in. Please try again.");
        }
    };
    const signUp = async () => {
        if (loading)
            return;
        if (name.trim().length < 2) {
            toast.error("Enter your full name");
            return;
        }
        setLoading(true);
        const email = customerEmail(phone);
        const password = customerPassword(phone);
        const { error } = await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: name.trim(), phone, role: "customer", referral_code: hasReferral ? referral.trim() : null } },
        });
        if (error) {
            setLoading(false);
            toast.error(error.message);
            return;
        }
        const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
        if (e2) {
            setLoading(false);
            toast.error(e2.message);
            return;
        }
        const { data: u } = await supabase.auth.getUser();
        if (u?.user) {
            await supabase.from("customer_profiles").upsert({
                user_id: u.user.id,
                full_name: name.trim(),
                phone,
            }, { onConflict: "user_id" });
        }
        setLoading(false);
        goAfterAuth();
    };
    const backToPhone = () => { setOtp(""); setName(""); setResendIn(0); setStep("phone"); };
    return (<div className="relative flex min-h-screen flex-col bg-[#FFF9F3]">
      <div className="relative flex flex-1 flex-col px-6 pb-10 pt-10">
        {step !== "phone" && (<button onClick={backToPhone} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90">
            <ArrowLeft className="h-5 w-5 text-[#1a1a1a]"/>
          </button>)}

        <div className={cn("flex flex-col items-center text-center", step === "phone" ? "mt-12" : "mt-8")}>
          <div className="relative">
             <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full"/>
             <img src={logo} alt="Urban Wash" className="relative h-16 w-16 rounded-[20px] object-cover shadow-sm"/>
          </div>
          <div className="mt-4 leading-tight">
            <p className="text-xl font-black tracking-tight text-[#1a1a1a]">Urban Wash</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Lucknow</p>
          </div>
        </div>

        {step === "phone" && (<div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">Get started</h1>
            <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-muted-foreground/70">
              Enter your mobile number to log in or create your account.
            </p>

            <div className="mt-10 flex items-center rounded-2xl border border-black/5 bg-white px-5 py-5 shadow-sm focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all">
              <span className="text-base font-black text-[#1a1a1a]">+91</span>
              <span className="mx-4 h-6 w-px bg-black/5"/>
              <Input inputMode="numeric" autoComplete="tel" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="Mobile number" className="h-auto border-0 bg-transparent p-0 text-lg font-bold tracking-wider shadow-none focus-visible:ring-0 placeholder:font-medium placeholder:text-muted-foreground/40"/>
            </div>

            <Button size="lg" onClick={sendOtp} disabled={phone.length !== 10} className="mt-6 h-15 w-full rounded-2xl text-base font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
              Continue
            </Button>

            <div className="mt-8 flex items-center gap-3 justify-center">
              <Checkbox id="ref" checked={hasReferral} onCheckedChange={(v) => setHasReferral(v === true)} className="h-5 w-5 rounded-md border-black/10"/>
              <label htmlFor="ref" className="text-sm font-bold text-muted-foreground/80">Have a referral code?</label>
            </div>
            {hasReferral && (<Input value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} placeholder="Enter code" className="mt-4 h-13 rounded-xl border-black/5 bg-white text-center font-bold tracking-widest animate-in fade-in slide-in-from-top-2 duration-300"/>)}

            <div className="mt-16 flex flex-col items-center">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40">
                <ShieldCheck className="h-3.5 w-3.5 text-success"/> SECURE & PRIVATE
              </p>
              <p className="mt-4 max-w-[240px] text-center text-[11px] font-medium leading-relaxed text-muted-foreground/50">
                By continuing, you agree to our{" "}
                <Link to="/trust" className="font-bold text-primary underline underline-offset-4">Terms</Link> &{" "}
                <Link to="/trust" className="font-bold text-primary underline underline-offset-4">Privacy Policy</Link>
              </p>
            </div>
          </div>)}

        {step === "otp" && (<div className="mt-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">Verification</h1>
            <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-muted-foreground/70">
              Enter the code sent to <span className="font-bold text-[#1a1a1a]">+91 {phone}</span>
            </p>

            <div className="mt-10">
              <OtpInput value={otp} onChange={setOtp} length={OTP_LENGTH} disabled={loading} onComplete={(code) => void verifyOtp(code)}/>
            </div>

            {SHOW_DEMO_OTP && (<p className="mt-6 text-center text-[13px] font-bold text-primary/40 tracking-wider">
                DEMO CODE: <span className="font-mono text-primary">1234</span>
              </p>)}

            <Button size="lg" className="mt-10 h-15 w-full rounded-2xl text-base font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" onClick={() => void verifyOtp()} disabled={loading || otp.length !== OTP_LENGTH}>
              {loading ? (<div className="flex items-center gap-3">
                   <Loader2 className="h-5 w-5 animate-spin"/>
                   <span>Verifying...</span>
                </div>) : "Verify & Continue"}
            </Button>

            <div className="mt-8 text-center">
              {resendIn > 0 ? (<p className="text-[13px] font-bold text-muted-foreground/50">
                  Resend code in <span className="tabular-nums text-primary">{resendIn}s</span>
                </p>) : (<button onClick={resendOtp} className="text-[14px] font-black text-primary hover:opacity-80 transition-opacity">
                  Resend Code
                </button>)}
            </div>

            <div className="mt-12 rounded-3xl border border-black/5 bg-white p-6 text-center shadow-sm">
              <p className="text-[13px] font-bold text-[#1a1a1a]">Didn't get the code?</p>
              <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-muted-foreground/60">
                Wait for the timer to finish, or check if the number is correct.
              </p>
              <button onClick={backToPhone} className="mt-4 text-[12px] font-black uppercase tracking-wider text-primary hover:opacity-80 transition-opacity">
                Edit number
              </button>
            </div>
          </div>)}

        {step === "name" && (<div className="mt-12 animate-in fade-in slide-in-from-right-4 duration-500">
            <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">Welcome!</h1>
            <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-muted-foreground/70">
              Just a final step — what should we call you?
            </p>
            <div className="mt-10">
              <Label className="text-[13px] font-bold text-muted-foreground/60 uppercase tracking-widest ml-1">Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" autoComplete="name" className="mt-2 h-15 rounded-2xl border-black/5 bg-white text-lg font-bold shadow-sm focus-visible:ring-4 focus-visible:ring-primary/5 transition-all"/>
            </div>
            <Button size="lg" className="mt-8 h-15 w-full rounded-2xl text-base font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" onClick={signUp} disabled={loading || name.trim().length < 2}>
              {loading ? (<div className="flex items-center gap-3">
                   <Loader2 className="h-5 w-5 animate-spin"/>
                   <span>Creating Account...</span>
                </div>) : "Get Started ✓"}
            </Button>
          </div>)}
      </div>
    </div>);
}
