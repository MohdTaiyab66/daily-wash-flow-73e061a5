import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
/**
 * 6-box (configurable) OTP entry with:
 *  - auto-advance / auto-backspace
 *  - full-code paste anywhere in the row
 *  - Web OTP API autofill on supported Android browsers (autocomplete token)
 *  - onComplete fired once the last digit lands
 *
 * Purely a controlled input — verification logic stays in the caller.
 */
export function OtpInput({ value, onChange, length = 4, disabled, autoFocus = true, onComplete, }) {
    const refs = useRef([]);
    const digits = useMemo(() => Array.from({ length }, (_, i) => value[i] ?? ""), [value, length]);
    useEffect(() => {
        if (autoFocus)
            refs.current[0]?.focus();
    }, [autoFocus]);
    // Web OTP API — Android Chrome can read the SMS and fill the code.
    useEffect(() => {
        const ac = "OTPCredential" in window ? new AbortController() : null;
        if (!ac)
            return;
        navigator.credentials
            ?.get({ otp: { transport: ["sms"] }, signal: ac.signal })
            .then((cred) => {
            const code = String(cred?.code ?? "").replace(/\D/g, "").slice(0, length);
            if (code.length === length) {
                onChange(code);
                onComplete?.(code);
            }
        })
            .catch(() => { });
        return () => ac.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [length]);
    const setAt = (i, ch) => {
        const next = digits.slice();
        next[i] = ch;
        const code = next.join("").slice(0, length);
        onChange(code);
        if (code.length === length && !code.includes(""))
            onComplete?.(code);
    };
    return (<div className="flex items-center justify-center gap-2.5" data-testid="otp-input">
      {digits.map((d, i) => (<input key={i} ref={(el) => { refs.current[i] = el; }} value={d} disabled={disabled} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={1} aria-label={`Digit ${i + 1}`} onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                if (!raw) {
                    setAt(i, "");
                    return;
                }
                if (raw.length > 1) {
                    // paste
                    const code = raw.slice(0, length);
                    onChange(code);
                    refs.current[Math.min(code.length, length - 1)]?.focus();
                    if (code.length === length)
                        onComplete?.(code);
                    return;
                }
                setAt(i, raw);
                if (i < length - 1)
                    refs.current[i + 1]?.focus();
            }} onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) {
                    refs.current[i - 1]?.focus();
                    setAt(i - 1, "");
                }
                if (e.key === "ArrowLeft" && i > 0)
                    refs.current[i - 1]?.focus();
                if (e.key === "ArrowRight" && i < length - 1)
                    refs.current[i + 1]?.focus();
            }} onPaste={(e) => {
                const code = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
                if (!code)
                    return;
                e.preventDefault();
                onChange(code);
                refs.current[Math.min(code.length, length - 1)]?.focus();
                if (code.length === length)
                    onComplete?.(code);
            }} className={cn("h-14 w-12 rounded-2xl border bg-card text-center text-xl font-semibold tabular-nums outline-none transition-all", "focus:border-primary focus:ring-2 focus:ring-primary/25", d ? "border-primary/50" : "border-input", disabled && "opacity-60")}/>))}
    </div>);
}
