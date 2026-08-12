import { z } from "zod";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldCheck, AlertCircle } from "lucide-react";
import { OtpInput } from "@/components/customer/ui/OtpInput";
const authLog = {
  trace: (m: string, ...args: any[]) => console.log(`[AUTH][TRACE] ${m}`, ...args),
  info: (m: string, ...args: any[]) => console.log(`[AUTH][INFO] ${m}`, ...args),
  error: (m: string, ...args: any[]) => console.error(`[AUTH][ERROR] ${m}`, ...args),
};

const getAuthErrorDetails = (err: any) => {
  if (!err) return { message: "Unknown error" };
  return {
    message: err.message || "Unknown error",
    code: err.code || "unknown",
    status: err.status || 500
  };
};

const parseAuthError = (err: any) => {
  const details = getAuthErrorDetails(err);
  return details.message;
};

import logo from "@/assets/logo.jpeg";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/c/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Log in — Urban Wash" }] }),
  validateSearch: (search) => z.object({ redirect: z.string().optional().catch(undefined) }).parse(search),
  component: CustomerAuth,
});

type Step = "phone" | "otp" | "name";

const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-10);
const customerEmail = (phone: string) => `${normalizePhone(phone)}@customer.urbanwash.app`;
const customerPassword = (phone: string) => `UWC@${normalizePhone(phone)}#2026`;

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const SHOW_DEMO_OTP = true; 
const VERIFY_TIMEOUT_MS = 10000;


type VerifyState = "IDLE" | "VERIFYING" | "SUCCESS" | "ERROR" | "TIMEOUT";

function CustomerAuth() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const goAfterAuth = () => {
    if (redirect) { navigate({ to: redirect as any, replace: true }); return; }
    const area = localStorage.getItem("uw_customer_area");
    navigate({ to: area ? "/c/home" : "/c/location/search", replace: true });
  };

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [hasReferral, setHasReferral] = useState(false);
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>("IDLE");
  const verifyingRef = useRef(false);

  useEffect(() => {
    (async () => {
      authLog.trace("[AUTH][STARTUP] Checking existing session...");
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session?.user?.email?.endsWith("@customer.urbanwash.app")) {
        authLog.info("[AUTH][STARTUP] session present = true (auto-navigating)");
        goAfterAuth();
      } else {
        authLog.info("[AUTH][STARTUP] session present = false");
      }
    })();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const sendOtp = () => {
    setError(null);
    setVerifyState("IDLE");
    if (!/^\d{10}$/.test(normalizePhone(phone))) { 
      setError("Enter a valid 10-digit mobile number");
      return; 
    }
    
    authLog.info("[AUTH-P0] OTP SEND START", { phone: phone.replace(/(\d{2})(\d{4})(\d{4})/, "+91 $1****$3") });
    setStep("otp");
    setOtp("");
    setResendIn(RESEND_SECONDS);
    toast.success(`OTP sent to +91 ${phone}`);
  };

  const resendOtp = () => {
    if (resendIn > 0) return;
    setError(null);
    setVerifyState("IDLE");
    authLog.info("[AUTH-P0] OTP RESEND", { phone });
    setOtp("");
    setResendIn(RESEND_SECONDS);
    toast.success("OTP sent again");
  };

  const verifyOtp = async (code = otp) => {
    if (verifyingRef.current) {
      authLog.trace("Verify already in progress, ignoring tap");
      return;
    }
    setError(null);
    setVerifyState("VERIFYING");
    authLog.info("[OTP-P0] VERIFY START", { codeLength: code.length, phone: phone.slice(-4) });
    
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code`);
      setVerifyState("ERROR");
      return;
    }
    
    // Guard for demo mode
    if (SHOW_DEMO_OTP && code !== "123456") {
      authLog.error("[AUTH][OTP] verification failed at guard", { 
        entered: code, 
        expected: "123456",
        reason: "Invalid OTP (demo mode requires 123456)" 
      });
      setError("That code doesn't look right. Please try again.");
      setVerifyState("ERROR");
      return;
    }

    verifyingRef.current = true;
    setLoading(true);
    authLog.info("[AUTH-TRACE] 09 OTP_VERIFY_START");
    
    const email = customerEmail(phone);
    const password = customerPassword(phone);
    
    const verifyPromise = supabase.auth.signInWithPassword({ email, password });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("TIMEOUT")), VERIFY_TIMEOUT_MS)
    );

    try {
      const { data, error: signInError } = await Promise.race([verifyPromise, timeoutPromise]) as any;
      
      authLog.info("[OTP-P0] VERIFY RESPONSE RECEIVED");
      if (data) {
        authLog.info("[OTP-P0] DATA PRESENT", { session: !!data.session, user: !!data.user });
      }

      if (data?.session) {
        setVerifyState("SUCCESS");
        authLog.info("[AUTH-TRACE] 11 POST_VERIFY_GET_SESSION");

        // Explicitly confirm persistence
        const { data: sessionCheck } = await supabase.auth.getSession();
        const isSessionPresent = !!sessionCheck.session;
        authLog.info(`[AUTH-TRACE] 12 SESSION_PERSISTED: ${isSessionPresent ? 'YES' : 'NO'}`);

        if (!isSessionPresent) {
          authLog.error("[AUTH-TRACE] REDIRECTING: Persistence failure - session lost immediately");
          setError("Authentication failed: session could not be established. Please try again.");
          setVerifyState("ERROR");
          setLoading(false);
          verifyingRef.current = false;
          return;
        }

        authLog.info("[AUTH-TRACE] 13 AUTHENTICATED");
        authLog.info("[AUTH-TRACE] 14 HOME_NAVIGATION");
        goAfterAuth();
        return;
      }
      
      if (signInError) {
        const details = getAuthErrorDetails(signInError);
        authLog.error("[OTP-P0] VERIFY ERROR", details);
        
        const msg = (details.message ?? "").toLowerCase();
        const isNewUser = msg.includes("invalid login credentials") || msg.includes("invalid_credentials") || msg.includes("user not found");
          
        if (isNewUser) {
          authLog.info("[AUTH-TRACE] User not found, moving to signup step");
          setStep("name");
          setVerifyState("IDLE");
        } else {
          setError(parseAuthError(signInError));
          setVerifyState("ERROR");
        }
      }
    } catch (e: any) {
      if (e.message === "TIMEOUT") {
        authLog.error("[OTP-P0] VERIFY TIMEOUT");
        setError("Verification timed out. Please check your internet connection and try again.");
        setVerifyState("TIMEOUT");
      } else {
        const details = getAuthErrorDetails(e);
        authLog.error("[AUTH-TRACE] Unexpected verification error", details);
        setError(`Something went wrong: ${details.message}`);
        setVerifyState("ERROR");
      }
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  };


  const signUp = async () => {
    if (loading) return;
    setError(null);
    
    if (name.trim().length < 2) { 
      setError("Enter your full name");
      return; 
    }
    
    setLoading(true);
    const email = customerEmail(phone);
    const password = customerPassword(phone);
    
    authLog.info("Registering new customer", { email, name });
    
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { 
          data: { 
            full_name: name.trim(), 
            phone, 
            role: "customer", 
            referral_code: hasReferral ? referral.trim() : null 
          } 
        },
      });
      
      if (signUpError) {
        authLog.error("Signup failed", signUpError);
        setError(parseAuthError(signUpError));
        setLoading(false);
        return;
      }
      
      const { data: signInData, error: e2 } = await supabase.auth.signInWithPassword({ email, password });
      if (e2 || !signInData.session) {
        authLog.error("[AUTH-P0] Sign in after signup failed", e2);
        setError(parseAuthError(e2 || new Error("Session not created after signup")));
        setLoading(false);
        return;
      }

      authLog.info("[AUTH-P0] SESSION PRESENT (after signup)");

      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        authLog.info("[AUTH-P0] USER PRESENT", { userId: u.user.id });
        authLog.info("Saving customer profile...", { userId: u.user.id });
        await supabase.from("customer_profiles").upsert({
          user_id: u.user.id,
          full_name: name.trim(),
          phone,
          email,
        }, { onConflict: "user_id" });
      }
      
      authLog.info("[AUTH-TRACE] 11 POST_VERIFY_GET_SESSION");
      const { data: finalCheck } = await supabase.auth.getSession();
      if (finalCheck.session) {
        authLog.info("[AUTH-TRACE] 12 SESSION_PERSISTED: YES");
        authLog.info("[AUTH-TRACE] 13 AUTHENTICATED");
        authLog.info("[AUTH-TRACE] 14 HOME_NAVIGATION");
        goAfterAuth();
      } else {
        authLog.error("[AUTH-TRACE] 12 SESSION_PERSISTED: NO");
        setError("Account created, but could not establish session. Please log in.");
        setStep("phone");
      }
    } catch (e) {
      authLog.error("Unexpected signup error", e);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const backToPhone = () => { 
    setError(null);
    setOtp(""); 
    setName(""); 
    setResendIn(0); 
    setStep("phone"); 
  };

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

        {error && (
          <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col gap-2 rounded-2xl bg-destructive/5 px-4 py-3.5 border border-destructive/10">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-[13px] font-bold text-destructive uppercase tracking-widest">
                  Verification Failed
                </p>
              </div>
              <p className="text-[13px] font-semibold text-destructive/90 leading-tight">
                {error}
              </p>
            </div>
          </div>
        )}


        {step === "phone" && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-2xl font-black tracking-tight text-[#1a1a1a]">Get started</h1>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-muted-foreground/70">
              Enter your mobile number to log in or create your account.
            </p>

            <div className="mt-8 flex items-center rounded-2xl border border-black/5 bg-white px-5 py-5 shadow-sm focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 transition-all">
              <span className="text-base font-black text-[#1a1a1a]">+91</span>
              <span className="mx-4 h-6 w-px bg-black/5" />
              <Input
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                value={phone}
                onChange={(e) => {
                  setError(null);
                  setPhone(e.target.value.replace(/\D/g, ""));
                }}
                placeholder="Mobile number"
                className="h-auto border-0 bg-transparent p-0 text-lg font-bold tracking-wider shadow-none focus-visible:ring-0 placeholder:font-medium placeholder:text-muted-foreground/40"
              />
            </div>

            <Button
              size="lg"
              onClick={sendOtp}
              disabled={phone.length !== 10 || loading}
              className="mt-6 h-15 w-full rounded-2xl text-base font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
            </Button>

            <div className="mt-8 flex items-center gap-3 justify-center">
              <Checkbox
                id="ref"
                checked={hasReferral}
                onCheckedChange={(v) => setHasReferral(v === true)}
                className="h-5 w-5 rounded-md border-black/10"
              />
              <label htmlFor="ref" className="text-sm font-bold text-muted-foreground/80">Have a referral code?</label>
            </div>
            {hasReferral && (
              <Input
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="Enter code"
                className="mt-4 h-13 rounded-xl border-black/5 bg-white text-center font-bold tracking-widest animate-in fade-in slide-in-from-top-2 duration-300"
              />
            )}

            <div className="mt-12 flex flex-col items-center">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/40">
                <ShieldCheck className="h-3.5 w-3.5 text-success" /> SECURE & PRIVATE
              </p>
              <p className="mt-4 max-w-[240px] text-center text-[11px] font-medium leading-relaxed text-muted-foreground/50">
                By continuing, you agree to our{" "}
                <Link to="/trust" className="font-bold text-primary underline underline-offset-4">Terms</Link> &{" "}
                <Link to="/trust" className="font-bold text-primary underline underline-offset-4">Privacy Policy</Link>
              </p>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="mt-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <h1 className="text-2xl font-black tracking-tight text-[#1a1a1a]">Verification</h1>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-muted-foreground/70">
              Enter the code sent to <span className="font-bold text-[#1a1a1a]">+91 ••••••{normalizePhone(phone).slice(-4)}</span>
            </p>

            <div className="mt-10">
              <OtpInput
                value={otp}
                onChange={(v) => {
                  setError(null);
                  setOtp(v);
                }}
                disabled={loading}
                onComplete={verifyOtp}
              />
            </div>

            <div className="mt-4 flex flex-col items-center gap-2">
              {SHOW_DEMO_OTP && (
                <p className="text-[13px] font-bold text-primary/40 tracking-wider">
                  DEMO CODE: <span className="font-mono text-primary">123456</span>
                </p>
              )}
            </div>


            <Button
              size="lg"
              onClick={() => verifyOtp()}
              disabled={otp.length !== OTP_LENGTH || loading}
              className="mt-10 h-15 w-full rounded-2xl text-base font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Verifying…</span>
                </div>
              ) : (
                "Verify & Continue"
              )}
            </Button>

            <div className="mt-8 text-center">
              <button
                onClick={resendOtp}
                disabled={resendIn > 0 || loading}
                className={cn(
                  "text-[14px] font-bold transition-all active:scale-95",
                  resendIn > 0 ? "text-muted-foreground/40" : "text-primary hover:text-primary/80"
                )}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend Code"}
              </button>
            </div>
          </div>
        )}

        {step === "name" && (
          <div className="mt-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <h1 className="text-2xl font-black tracking-tight text-[#1a1a1a]">Final step</h1>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-muted-foreground/70">
              Help us personalize your experience by sharing your name.
            </p>

            <div className="mt-10 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-black uppercase tracking-wider text-muted-foreground/60 ml-1">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setError(null);
                    setName(e.target.value);
                  }}
                  placeholder="e.g. Mohd Taiyab"
                  className="h-14 rounded-2xl border-black/5 bg-white px-5 text-base font-bold shadow-sm focus-visible:ring-primary/20"
                />
              </div>
            </div>

            <Button
              size="lg"
              onClick={signUp}
              disabled={name.trim().length < 2 || loading}
              className="mt-10 h-15 w-full rounded-2xl text-base font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Creating account…</span>
                </div>
              ) : (
                "Complete Profile"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
