import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.jpeg";
import hero from "@/assets/hero-car-wash.jpg";
import { readGuestCart, writeGuestCart } from "@/lib/guest-cart";
import { track } from "@/lib/funnel";

export const Route = createFileRoute("/c/welcome")({
  ssr: false,
  head: () => ({ meta: [{ title: "Welcome — Urban Wash" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: CustomerWelcome,
});

type Step = "phone" | "otp" | "name";

const customerEmail = (phone: string) => `${phone}@customer.urbanwash.app`;
const customerPassword = (phone: string) => `UWC@${phone}#2026`;

function CustomerWelcome() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const goAfterAuth = () => {
    if (redirect) { navigate({ to: redirect as any }); return; }
    const area = localStorage.getItem("uw_customer_area");
    navigate({ to: area ? "/c/home" : "/c/location" });
  };
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [hasReferral, setHasReferral] = useState(false);
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.email?.endsWith("@customer.urbanwash.app")) {
        goAfterAuth();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendOtp = () => {
    if (!/^\d{10}$/.test(phone)) { toast.error("Enter a valid 10-digit mobile number"); return; }
    setStep("otp");
    toast.success("OTP sent. Use 1234 to continue (demo)");
  };

  const verifyOtp = async () => {
    if (otp !== "1234") { toast.error("Invalid OTP. Use 1234"); return; }
    setLoading(true);
    const email = customerEmail(phone);
    const password = customerPassword(phone);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (data.session) {
      await migrateGuestVehicle();
      track("otp_completed", { mode: "signin" });
      goAfterAuth();
      return;
    }
    if (error) setStep("name");
  };

  const signUp = async () => {
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
    await migrateGuestVehicle();
    track("otp_completed", { mode: "signup" });
    setLoading(false);
    goAfterAuth();
  };

  const skipLogin = () => {
    track("skip_login");
    const area = localStorage.getItem("uw_customer_area");
    navigate({ to: area ? "/c/services" : "/c/location" });
  };

  // 12-cell grid of service illustrations (uses the hero image cropped via background-position)
  const tiles = Array.from({ length: 12 });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Green header */}
      <div className="relative bg-primary text-primary-foreground rounded-b-[36px] px-5 pt-8 pb-10">
        {step === "phone" ? (
          <button
            onClick={skipLogin}
            className="absolute right-5 top-6 rounded-full bg-primary-foreground/15 px-4 py-1.5 text-sm font-semibold backdrop-blur hover:bg-primary-foreground/25"
          >
            Skip login
          </button>
        ) : (
          <button
            onClick={() => setStep("phone")}
            className="absolute left-5 top-6 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-sm font-semibold backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        <div className="mt-8 flex flex-col items-center text-center">
          <img src={logo} alt="" className="h-12 w-12 rounded-xl object-cover" />
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Urban Wash</h1>
          <p className="mt-3 text-lg font-semibold leading-snug">
            Making Every Ride Shine
          </p>
        </div>
      </div>

      {/* Tile gallery */}
      <div className="relative px-3 -mt-2">
        <div className="grid grid-cols-4 gap-1.5">
          {tiles.map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-xl bg-cover bg-center ring-1 ring-border"
              style={{
                backgroundImage: `url(${hero})`,
                backgroundPosition: `${(i % 4) * 33}% ${Math.floor(i / 4) * 33}%`,
                opacity: i >= 8 ? 0.35 : 1,
              }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-background" />
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pt-6 pb-8">
        {step === "phone" && (
          <>
            <h2 className="text-center text-2xl font-bold tracking-tight">Log in or Sign up</h2>
            <div className="mt-5">
              <div className="flex items-center rounded-xl border border-input bg-card px-4 py-3">
                <span className="text-base font-bold text-foreground">+91</span>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter mobile number"
                  className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0 ml-3 p-0 h-auto"
                />
              </div>
              <Button
                size="lg"
                onClick={sendOtp}
                disabled={phone.length !== 10}
                className="mt-4 w-full h-14 rounded-xl text-base font-semibold"
              >
                Continue
              </Button>

              <div className="mt-5 flex items-center gap-3">
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
                  className="mt-3 rounded-xl"
                />
              )}

              <p className="mt-6 text-center text-xs text-muted-foreground">
                By continuing, you agree to our{" "}
                <Link to="/trust" className="underline font-semibold">Terms of Service</Link> &{" "}
                <Link to="/trust" className="underline font-semibold">Privacy Policy</Link>
              </p>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <h2 className="text-center text-2xl font-bold tracking-tight">Verify mobile</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">Code sent to +91 {phone}</p>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="mt-5 text-center text-2xl tracking-[0.5em] h-14 rounded-xl"
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">Demo OTP: <span className="font-mono">1234</span></p>
            <Button size="lg" className="mt-4 w-full h-14 rounded-xl text-base font-semibold" onClick={verifyOtp} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify
            </Button>
          </>
        )}

        {step === "name" && (
          <>
            <h2 className="text-center text-2xl font-bold tracking-tight">Welcome to Urban Wash</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">Tell us your name to set up your account</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="mt-5 rounded-xl h-12"
            />
            <Button size="lg" className="mt-4 w-full h-14 rounded-xl text-base font-semibold" onClick={signUp} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create my account
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
