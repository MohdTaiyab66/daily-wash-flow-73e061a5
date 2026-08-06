import { z } from "zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Clock, IndianRupee, Map as MapIcon, Car, Users, Lock } from "lucide-react";
import logo from "@/assets/logo.jpeg";

import { prepareStaffLogin, requestStaffOtp } from "@/lib/staff-auth.functions";
import { PARTNER_APP_VERSION } from "@/lib/buildInfo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Partner Login — Urban Wash" }] }),
  validateSearch: z.object({ redirect: z.string().startsWith("/").optional().catch(undefined) }),
  component: AuthPage,
});

type Step = "phone" | "otp" | "name";

const OTP_LENGTH = 6; // Server-issued one-time code (see src/lib/staff-auth.functions.ts).

// Phone-as-email pattern (phone provider is disabled on this project).


function haptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const nextRoute = redirect?.startsWith("/admin") ? redirect : redirect?.startsWith("/app") ? redirect : "/app";
  const isAdminLogin = nextRoute.startsWith("/admin");

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const prepareLogin = useServerFn(prepareStaffLogin);
  const requestOtp = useServerFn(requestStaffOtp);


  const otp = otpDigits.join("");

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const email = sess.session?.user.email || "";
      if (!email) return;
      if (isAdminLogin && email.endsWith("@admin.urbanwash.app")) navigate({ to: nextRoute as any });
      else if (!isAdminLogin && email.endsWith("@partner.urbanwash.app")) navigate({ to: nextRoute as any });
    })();
  }, [isAdminLogin, navigate, nextRoute]);

  // Web OTP API — SMS auto-fill on Android Chrome
  useEffect(() => {
    if (step !== "otp") return;
    if (typeof window === "undefined") return;
    const w = window as any;
    if (!("OTPCredential" in w)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: ac.signal } as any)
      .then((cred: any) => {
        const code: string = cred?.code || "";
        if (code) {
          const digits = code.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
          const next = Array(OTP_LENGTH).fill("").map((_, i) => digits[i] ?? "");
          setOtpDigits(next);
          if (next.every((d) => d !== "")) void submitOtp(next.join(""));
        }
      })
      .catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const ensureStaffRole = async (role: "admin" | "partner", fullName?: string) => {
    const { data, error } = await supabase.rpc("ensure_staff_login_role" as any, {
      p_role: role,
      p_full_name: fullName || null,
    });
    if (error || !data) throw new Error(error?.message || `${role === "admin" ? "Admin" : "Partner"} access is not enabled for this phone`);
  };

  const sendOtp = async () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit phone"); return; }
    haptic(15);
    setLoading(true);
    try {
      const res = await requestOtp({ data: { phone, role: isAdminLogin ? "admin" : "partner" } });
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      if (res.newAccount) {
        // No account exists for this number yet — continue to sign-up.
        setStep("name");
        return;
      }
      setStep("otp");
      toast.success(
        res.delivery === "push"
          ? "Code sent to your registered Urban Wash device."
          : "Code generated. Contact Urban Wash support to receive it.",
      );
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (e: any) {
      toast.error(e?.message || "Could not send the code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (code: string) => {
    if (!/^\d{6}$/.test(code)) {
      haptic([40, 40, 40]);
      toast.error("Enter the 6-digit code");
      return;
    }
    haptic(20);
    setLoading(true);
    try {
      const role = isAdminLogin ? "admin" : "partner";
      const prepared = await prepareLogin({ data: { phone, otp: code, role, fullName: "" } });
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: prepared.email,
        password: prepared.password,
      });
      if (signInErr || !signInData.session) throw new Error(signInErr?.message || "Could not sign in");

      if (!isAdminLogin) {
        const uid = signInData.session.user.id;
        const { data: partner } = await supabase.from("partners").select("full_name").eq("id", uid).maybeSingle();
        if (!partner?.full_name) { setLoading(false); setStep("name"); return; }
        await ensureStaffRole("partner", partner.full_name);
      } else {
        await ensureStaffRole("admin");
      }
      navigate({ to: nextRoute as any });
    } catch (e: any) {
      haptic([40, 40, 40]);
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => otpRefs.current[0]?.focus(), 30);
      toast.error(e?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const handleOtpChange = (idx: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...otpDigits];
      next[idx] = "";
      setOtpDigits(next);
      return;
    }
    const next = [...otpDigits];
    // support paste
    if (clean.length > 1) {
      const chars = clean.slice(0, OTP_LENGTH - idx).split("");
      chars.forEach((c, i) => { next[idx + i] = c; });
      setOtpDigits(next);
      const lastFilled = Math.min(idx + chars.length, OTP_LENGTH - 1);
      otpRefs.current[lastFilled]?.focus();
      haptic(8);
      if (next.every((d) => d !== "")) void submitOtp(next.join(""));
      return;
    }
    next[idx] = clean[0];
    setOtpDigits(next);
    haptic(8);
    if (idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
    if (next.every((d) => d !== "")) void submitOtp(next.join(""));
  };

  const handleOtpKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
      const next = [...otpDigits];
      next[idx - 1] = "";
      setOtpDigits(next);
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) { toast.error("Enter your full name"); return; }
    setLoading(true);
    const role = isAdminLogin ? "admin" : "partner";

    try {
      // Existing (already signed-in) staff finishing their profile.
      const { data: current } = await supabase.auth.getSession();
      if (!current.session) {
        // New account: nothing exists for this number, so no code is required.
        const prepared = await prepareLogin({ data: { phone, otp, role, fullName: name.trim() } });
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: prepared.email,
          password: prepared.password,
        });
        if (signInErr || !signInData.session) throw new Error(signInErr?.message || "Could not sign in");
      }

      await supabase.auth.updateUser({ data: { full_name: name.trim(), phone, role } });
      await ensureStaffRole(role as "admin" | "partner", name.trim());
      navigate({ to: nextRoute as any });
    } catch (e: any) {
      toast.error(e?.message || "Could not complete sign in");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0B0F] text-white">
      {/* Splash overlay */}
      {showSplash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B0F] animate-fade-out [animation-delay:700ms] [animation-fill-mode:forwards]">
          <div className="flex flex-col items-center gap-4 animate-scale-in">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-orange-500/40 blur-2xl" />
              <img src={logo} alt="Urban Wash" className="relative h-20 w-20 rounded-3xl object-cover ring-1 ring-white/10" />
            </div>
            <div className="text-center">
              <div className="text-xl font-bold tracking-tight">Urban Wash</div>
              <div className="mt-1 text-xs uppercase tracking-[0.3em] text-orange-400">Partner</div>
            </div>
          </div>
        </div>
      )}

      {/* Subtle ambient glow + slow showroom shine */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-orange-500/20 blur-[120px] animate-[pulse_12s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,120,40,0.10),transparent_60%)]" />
        <div
          className="absolute -inset-x-1/2 top-0 h-full opacity-[0.06]"
          style={{
            background:
              "linear-gradient(115deg, transparent 30%, rgba(255,180,120,0.9) 50%, transparent 70%)",
            animation: "showroom-shine 14s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes showroom-shine {
            0%   { transform: translateX(-40%); opacity: 0; }
            15%  { opacity: 0.5; }
            50%  { transform: translateX(40%); opacity: 0.6; }
            85%  { opacity: 0.4; }
            100% { transform: translateX(60%); opacity: 0; }
          }
        `}</style>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 pt-7 pb-5">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-1.5 animate-fade-in">
          <div className="relative">
            <div className="absolute -inset-1.5 rounded-2xl bg-orange-500/25 blur-lg" />
            <img src={logo} alt="Urban Wash" className="relative h-14 w-14 rounded-2xl object-contain bg-black/40 p-1 ring-1 ring-white/15" />
          </div>
          <div className="text-center">
            <div className="text-[14px] font-semibold tracking-tight">Urban Wash</div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-orange-400">Partner</div>
          </div>
        </div>

        {/* Hero copy */}
        <div className="mt-7 text-center animate-fade-in">
          <h1 className="text-[26px] font-bold leading-[1.15] tracking-tight">
            Earn More. Drive Less.<br />
            <span className="text-orange-400">Shine Every Day.</span>
          </h1>
        </div>

        {/* Feature chips — equal width, equal height */}
        <div className="mt-6 grid grid-cols-3 gap-2 animate-fade-in">
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 text-[11px] text-white/75 backdrop-blur">
            <Clock className="h-3 w-3 shrink-0 text-orange-400" />
            <span className="truncate">4–6 Hrs/day</span>
          </span>
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 text-[11px] text-white/75 backdrop-blur">
            <IndianRupee className="h-3 w-3 shrink-0 text-orange-400" />
            <span className="truncate">₹110–150/hr*</span>
          </span>
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 text-[11px] text-white/75 backdrop-blur">
            <MapIcon className="h-3 w-3 shrink-0 text-orange-400" />
            <span className="truncate">Smart Routes</span>
          </span>
        </div>

        {/* Today's Marketplace strip — lighter */}
        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 backdrop-blur animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Today's Opportunities</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5 text-orange-400" />
              <span className="font-semibold text-white">24</span>
              <span className="text-white/55">New Leads</span>
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-orange-400" />
              <span className="font-semibold text-white">86</span>
              <span className="text-white/55">Partners Online</span>
            </span>
          </div>
        </div>



        {/* Card */}
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-fade-in">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-tight">
              {isAdminLogin ? "Admin login" : step === "name" ? "Almost done" : "Partner login"}
            </h2>
            <p className="mt-1 text-xs text-white/55">
              {step === "phone" && "We'll text you a one-time password."}
              {step === "otp" && `Enter the ${OTP_LENGTH}-digit code sent to +91 ${phone}.`}
              {step === "name" && "Tell us your name to finish signing up."}
            </p>
          </div>

          {step === "phone" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone" className="text-xs uppercase tracking-wider text-white/60">Phone number</Label>
                <div className="mt-2 flex h-[58px] overflow-hidden rounded-xl border border-white/10 bg-black/30 focus-within:border-orange-400/60 focus-within:ring-2 focus-within:ring-orange-400/20 transition">
                  <span className="inline-flex items-center border-r border-white/5 bg-white/[0.04] px-4 text-sm font-medium text-white/75">+91</span>
                  <Input
                    id="phone"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    className="h-full border-0 bg-transparent text-base text-white placeholder:text-white/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <Button
                size="lg"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-[0.99] transition"
                onClick={sendOtp}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[10px] text-white/35">
                <Lock className="h-3 w-3" aria-hidden /> Secure OTP Login
              </p>
              <p className="mt-3 text-[9px] leading-relaxed text-white/25 text-center">
                By continuing, you agree to Urban Wash {isAdminLogin ? "Admin" : "Partner"} terms.
              </p>

            </div>
          )}

          {step === "otp" && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <Label className="text-xs uppercase tracking-wider text-white/60">Verification code</Label>
                <div className="mt-3 flex justify-between gap-2">
                  {otpDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={OTP_LENGTH}
                      value={d}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKey(i, e)}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`h-14 w-full min-w-0 flex-1 rounded-xl border bg-black/30 text-center text-2xl font-semibold text-white outline-none transition
                        ${d ? "border-orange-400/70 shadow-[0_0_0_3px_rgba(255,140,50,0.15)]" : "border-white/10"}
                        focus:border-orange-400 focus:shadow-[0_0_0_3px_rgba(255,140,50,0.2)]`}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-white/40">
                  The 6-digit code expires in 5 minutes.
                </p>

              </div>
              <Button
                size="lg"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-lg shadow-orange-500/25 hover:brightness-110 disabled:opacity-60 transition"
                onClick={() => submitOtp(otp)}
                disabled={loading || otp.length !== OTP_LENGTH}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify & Continue
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-white/50 underline-offset-4 hover:text-white hover:underline"
                onClick={() => { setStep("phone"); setOtpDigits(Array(OTP_LENGTH).fill("")); }}
              >
                Change number
              </button>
            </div>
          )}

          {step === "name" && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="name" className="text-xs uppercase tracking-wider text-white/60">Full name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ravi Kumar"
                  className="mt-2 h-12 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/30 focus-visible:border-orange-400/60 focus-visible:ring-orange-400/20"
                />
              </div>
              <Button
                size="lg"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 font-semibold shadow-lg shadow-orange-500/25"
                onClick={saveName}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
              </Button>
            </div>
          )}
        </div>

        {!isAdminLogin && (
          <div className="mt-auto flex items-center justify-between pt-10 text-[9px] text-white/25">
            <a href="tel:+919999999999" className="hover:text-white/60 transition">Partner Support</a>
            <span className="font-mono">v{PARTNER_APP_VERSION}</span>
          </div>
        )}

      </div>
    </div>
  );
}
