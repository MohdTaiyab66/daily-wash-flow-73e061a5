import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Clock, IndianRupee, Map as MapIcon } from "lucide-react";
import logo from "@/assets/logo.jpeg";
import heroImg from "@/assets/auth-hero.jpg";
import { prepareStaffLogin } from "@/lib/staff-auth.functions";
import { PARTNER_APP_VERSION, PARTNER_BUILD_ID } from "@/lib/buildInfo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Partner Login — Urban Wash" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" && search.redirect.startsWith("/") ? search.redirect : undefined,
  }),
  component: AuthPage,
});

type Step = "phone" | "otp" | "name";

const OTP_LENGTH = 4; // Demo OTP is 1234 — do not change without updating auth logic.

// Phone-as-email pattern (phone provider is disabled on this project).
const partnerEmail = (phone: string) => `${phone}@partner.urbanwash.app`;
const adminEmail = (phone: string) => `${phone}@admin.urbanwash.app`;
const partnerPassword = (phone: string) => `UWP@${phone}#2026`;

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
  const emailFor = (p: string) => (isAdminLogin ? adminEmail(p) : partnerEmail(p));

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const prepareLogin = useServerFn(prepareStaffLogin);

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

  const sendOtp = () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit phone"); return; }
    haptic(15);
    setOtpDigits(Array(OTP_LENGTH).fill(""));
    setStep("otp");
    toast.success("OTP sent. Use 1234 to continue (demo)");
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  };

  const submitOtp = async (code: string) => {
    if (code !== "1234") {
      haptic([40, 40, 40]);
      toast.error("Invalid OTP. Use 1234");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => otpRefs.current[0]?.focus(), 30);
      return;
    }
    haptic(20);
    setLoading(true);
    try {
      const email = emailFor(phone);
      const password = partnerPassword(phone);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.session) {
        if (!isAdminLogin) {
          const uid = data.session.user.id;
          const { data: partner } = await supabase.from("partners").select("full_name").eq("id", uid).maybeSingle();
          if (!partner?.full_name) { setLoading(false); setStep("name"); return; }
          try { await ensureStaffRole("partner", partner.full_name); }
          catch (e: any) { toast.error(e.message || "Partner access is not enabled for this phone"); return; }
        } else {
          try { await ensureStaffRole("admin"); }
          catch (e: any) { toast.error(e.message || "Admin access is not enabled for this phone"); return; }
        }
        navigate({ to: nextRoute as any });
        return;
      }
      if (error) {
        if (isAdminLogin) {
          const prepared = await prepareLogin({ data: { phone, otp: code, role: "admin", fullName: "Admin" } });
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: prepared.email, password });
          if (signInErr || !signInData.session) throw new Error(signInErr?.message || "Could not sign in");
          await ensureStaffRole("admin");
          navigate({ to: nextRoute as any });
          return;
        }
        setStep("name");
      }
    } catch (e: any) {
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
    const email = emailFor(phone);
    const password = partnerPassword(phone);
    const role = isAdminLogin ? "admin" : "partner";

    try {
      await prepareLogin({ data: { phone, otp, role, fullName: name.trim() } });
    } catch (e: any) {
      setLoading(false); toast.error(e?.message || "Could not prepare login"); return;
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
    navigate({ to: nextRoute as any });
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

      {/* Hero image */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46vh]">
        <img
          src={heroImg}
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-90"
          width={1200}
          height={1600}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0B0B0F]/50 to-[#0B0B0F]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,120,40,0.25),transparent_55%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-6 pt-14 pb-8">
        {/* Brand header */}
        <div className="flex items-center gap-3 animate-fade-in">
          <div className="relative">
            <div className="absolute -inset-1 rounded-2xl bg-orange-500/30 blur-lg" />
            <img src={logo} alt="Urban Wash" className="relative h-11 w-11 rounded-2xl object-cover ring-1 ring-white/15" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Urban Wash</div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-orange-400">Partner</div>
          </div>
        </div>

        {/* Hero copy */}
        <div className="mt-8 animate-fade-in">
          <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight">
            Drive your <span className="text-orange-400">detailing</span> business forward.
          </h1>
          <p className="mt-3 max-w-[22rem] text-sm text-white/60">
            Manage jobs, track earnings, and grow your route — all from your phone.
          </p>
        </div>

        {/* Feature chips */}
        <div className="mt-5 flex flex-wrap gap-2 animate-fade-in">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
            <Zap className="h-3 w-3 text-orange-400" /> Instant jobs
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
            <ShieldCheck className="h-3 w-3 text-orange-400" /> Secure payouts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
            <Sparkles className="h-3 w-3 text-orange-400" /> Premium tools
          </span>
        </div>

        {/* Card */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-fade-in">
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
                <div className="mt-2 flex overflow-hidden rounded-xl border border-white/10 bg-black/30 focus-within:border-orange-400/60 focus-within:ring-2 focus-within:ring-orange-400/20 transition">
                  <span className="inline-flex items-center border-r border-white/10 bg-white/5 px-3 text-sm font-medium text-white/70">+91</span>
                  <Input
                    id="phone"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    className="border-0 bg-transparent text-white placeholder:text-white/30 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <Button
                size="lg"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold shadow-lg shadow-orange-500/25 hover:brightness-110 active:scale-[0.99] transition"
                onClick={sendOtp}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send OTP
              </Button>
              <p className="text-[11px] leading-relaxed text-white/40">
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
                  Demo OTP: <span className="font-mono text-orange-400">1234</span>
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
          <div className="mt-auto pt-8 text-center text-[10px] text-white/35">
            <p className="font-semibold uppercase tracking-[0.28em] text-white/50">Partner Build</p>
            <p className="mt-1">v{PARTNER_APP_VERSION}</p>
            <p className="mt-0.5 font-mono">{PARTNER_BUILD_ID}</p>
          </div>
        )}
      </div>
    </div>
  );
}
