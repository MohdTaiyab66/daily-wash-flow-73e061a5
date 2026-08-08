import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Plus,
  Droplets,
  Wrench,
  Sparkles,
  Loader2,
  Trash2,
  ShoppingBag,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createRazorpayOrder, verifyRazorpayPayment, logPaymentAttempt } from "@/lib/payment.functions";
import { openRazorpayCheckout } from "@/lib/paymentBridge";

/**
 * Phase 4 — Add-ons split
 *
 *   Monthly Add-ons   → recurring, attached to the subscription until removed
 *   One-time Add-ons  → this month only, routed to the existing service page
 *
 * BUSINESS RULE: NO PAYMENT = NO SERVICE.
 * Monthly add-ons are now paid upfront: adding one creates a pending row plus
 * a `pending_payment` booking, and it only becomes active after Razorpay
 * verification flips the booking to `paid` (DB trigger).
 */

type MonthlyRow = {
  id: string;
  addon_type: "extra_exterior" | "extra_interior" | "extra_both";
  quantity: number;
  monthly_price: number;
  is_active: boolean;
  added_at: string;
  payment_status: "pending" | "paid" | "failed" | "cancelled";
  booking_id: string | null;
};

const MONTHLY_OPTIONS: {
  addon_type: MonthlyRow["addon_type"];
  label: string;
  hint: string;
  price: number;
  icon: typeof Sparkles;
}[] = [
  {
    addon_type: "extra_exterior",
    label: "Extra Exterior Wash",
    hint: "+1 exterior wash every month",
    price: 149,
    icon: Droplets,
  },
  {
    addon_type: "extra_interior",
    label: "Extra Interior Wash",
    hint: "+1 interior wash every month",
    price: 199,
    icon: Wrench,
  },
  {
    addon_type: "extra_both",
    label: "Extra Interior & Exterior",
    hint: "+1 of each every month",
    price: 299,
    icon: Sparkles,
  },
];

const ONE_TIME_OPTIONS: {
  slug: string;
  label: string;
  hint: string;
  icon: typeof Sparkles;
}[] = [
  { slug: "body-polish", label: "Body Polish", hint: "This month only", icon: Sparkles },
  { slug: "roof-cleaning", label: "Roof Cleaning", hint: "This month only", icon: Droplets },
  { slug: "seat-cleaning", label: "Seat Shampoo", hint: "This month only", icon: Wrench },
];

export function MonthlyAddonsSection({
  subscriptionId,
  userId,
}: {
  subscriptionId: string | null;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const logAttempt = useServerFn(logPaymentAttempt);
  const [busyType, setBusyType] = useState<string | null>(null);

  const activeQ = useQuery({
    queryKey: ["monthly-addons", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async (): Promise<MonthlyRow[]> => {
      const { data, error } = await (supabase as any)
        .from("subscription_monthly_addons")
        .select("id, addon_type, quantity, monthly_price, is_active, added_at, payment_status, booking_id")
        .eq("subscription_id", subscriptionId)
        .is("removed_at", null)
        .in("payment_status", ["pending", "paid"])
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthlyRow[];
    },
  });

  const rows = activeQ.data ?? [];
  const rowFor = (t: MonthlyRow["addon_type"]) => rows.find((r) => r.addon_type === t) ?? null;
  const paidRows = rows.filter((r) => r.payment_status === "paid" && r.is_active);

  const safeLog = async (payload: Parameters<typeof logPaymentAttempt>[0] extends never ? never : any) => {
    try {
      await logAttempt({ data: payload });
    } catch {
      /* logging must never block checkout */
    }
  };

  /** Create pending add-on + booking, then take payment upfront. */
  const payMut = useMutation({
    mutationFn: async (opt: (typeof MONTHLY_OPTIONS)[number]) => {
      if (!subscriptionId || !userId) throw new Error("No active plan");

      const { data: bookingId, error } = await (supabase as any).rpc(
        "create_monthly_addon_checkout",
        { p_subscription_id: subscriptionId, p_addon_type: opt.addon_type },
      );
      if (error) throw new Error(error.message);
      if (!bookingId) throw new Error("Could not start checkout");
      await qc.invalidateQueries({ queryKey: ["monthly-addons", subscriptionId] });
      return runCheckout(String(bookingId), opt.label);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly-addons", subscriptionId] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add. Try again."),
    onSettled: () => setBusyType(null),
  });

  /** Retry payment for an already-created pending add-on. */
  const retryMut = useMutation({
    mutationFn: async (row: MonthlyRow) => {
      if (!row.booking_id) throw new Error("Missing checkout — remove and add again");
      const label = MONTHLY_OPTIONS.find((o) => o.addon_type === row.addon_type)?.label ?? "Add-on";
      return runCheckout(row.booking_id, label, true);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-addons", subscriptionId] }),
    onError: (e: any) => toast.error(e?.message ?? "Payment failed. Try again."),
    onSettled: () => setBusyType(null),
  });

  async function runCheckout(bookingId: string, label: string, isRetry = false) {
    const order = await createOrder({ data: { bookingId } });
    const { data: auth } = await supabase.auth.getUser();

    await safeLog({
      bookingId,
      channel: "unknown",
      outcome: isRetry ? "retry" : "started",
      providerOrderId: order.orderId,
    });

    const result = await openRazorpayCheckout({
      keyId: order.keyId,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      description: `${label} (monthly add-on)`,
      bookingId,
      prefillEmail: auth?.user?.email ?? "",
      prefillContact: (auth?.user?.phone as string) ?? "",
    });

    if (result.status === "cancelled") {
      await safeLog({ bookingId, channel: "unknown", outcome: "cancelled", providerOrderId: order.orderId });
      toast.message("Payment cancelled — the add-on stays pending until it's paid.");
      return;
    }

    if (result.status === "failed") {
      await safeLog({
        bookingId,
        channel: "native",
        outcome: "failure",
        providerOrderId: order.orderId,
        errorCode: result.code,
        errorMessage: result.message,
      });
      throw new Error(result.message);
    }


    await verifyPayment({
      data: {
        bookingId,
        razorpayOrderId: result.orderId,
        razorpayPaymentId: result.paymentId,
        razorpaySignature: result.signature,
      },
    });
    toast.success(`${label} added — active from your next billing cycle.`);
  }

  const removeMut = useMutation({
    mutationFn: async (row: MonthlyRow) => {
      const { error } = await (supabase as any)
        .from("subscription_monthly_addons")
        .update({
          is_active: false,
          payment_status: row.payment_status === "paid" ? row.payment_status : "cancelled",
          removed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly-addons", subscriptionId] });
      toast.success("Removed — will not renew next cycle.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove."),
  });

  if (!subscriptionId) return null;

  const busy = payMut.isPending || retryMut.isPending;

  return (
    <div className="mt-5 space-y-4">
      {/* Monthly Add-ons */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">Monthly add-ons</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Paid upfront — added every month until you remove them.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {MONTHLY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const row = rowFor(opt.addon_type);
            const isPaid = !!row && row.payment_status === "paid" && row.is_active;
            const isPending = !!row && row.payment_status === "pending";
            const thisBusy = busy && busyType === opt.addon_type;
            return (
              <div
                key={opt.addon_type}
                className={`rounded-2xl border p-3 ${
                  isPaid
                    ? "border-primary/50 bg-primary/5"
                    : isPending
                      ? "border-warning/50 bg-warning/10"
                      : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      isPaid ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    ₹{opt.price}
                    <span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                  </span>
                  {isPaid ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeMut.mutate(row!)}
                      disabled={removeMut.isPending}
                      aria-label={`Remove ${opt.label}`}
                    >
                      {removeMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  ) : isPending ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 rounded-full text-xs"
                      onClick={() => {
                        setBusyType(opt.addon_type);
                        payMut.mutate(opt);
                      }}
                      disabled={busy}
                    >
                      {thisBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {isPending && (
                  <div className="mt-3 rounded-xl border border-warning/40 bg-background p-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-warning-foreground">Payment pending</div>
                        <p className="text-[11px] text-muted-foreground">
                          This add-on activates only after payment is confirmed.
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 flex-1 rounded-full text-xs"
                        onClick={() => {
                          setBusyType(opt.addon_type);
                          retryMut.mutate(row!);
                        }}
                        disabled={busy}
                        data-testid="monthly-addon-retry"
                      >
                        {thisBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ₹${opt.price}`}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full text-xs text-muted-foreground"
                        onClick={() => removeMut.mutate(row!)}
                        disabled={removeMut.isPending || busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {paidRows.length > 0 && (
          <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            These apply from your next billing cycle. Total add-on cost: ₹
            {paidRows.reduce((sum, r) => sum + r.monthly_price * r.quantity, 0)}/mo
          </p>
        )}
      </div>

      {/* One-time Add-ons */}
      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">One-time add-ons</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              This month only — one-off services.
            </p>
          </div>
          <ShoppingBag className="h-5 w-5 shrink-0 text-primary" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {ONE_TIME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Link
                key={opt.slug}
                to="/c/service/$slug"
                params={{ slug: opt.slug }}
                className="flex flex-col items-start rounded-2xl border border-border bg-background p-3 transition-colors hover:border-primary/40"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="mt-2 text-[12px] font-semibold">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
