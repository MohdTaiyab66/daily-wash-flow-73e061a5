import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Calendar, Car, ChevronRight, Loader2, MapPin, Plus, RefreshCw, Sparkles, Minus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  logPaymentAttempt,
  getBookingPaymentStatus,
  acquireCheckoutHold,
  releaseCheckoutHold,
} from "@/lib/payment.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { validateExactGps, GPS_INVALID_MESSAGE } from "@/lib/gps";
import { traceVehicle } from "@/lib/vehicle-trace";
import { INCLUDED_PLAN_MESSAGE, exhaustedEntitlementMessage, normalizeBookingPreview } from "@/lib/entitlements";
import {
  appendPaymentDiagnostic,
  exportPaymentDiagnosticsFile,
  formatUpiUnavailableMessage,
  getNativePaymentDiagnostics,
  sanitizePaymentDiagnostic,
} from "@/lib/payment-diagnostics";
import {
  appendCheckoutEvent,
  clearPendingCheckout,
  getCheckoutHolderId,
  readPendingCheckout,
  savePendingCheckout,
  type CheckoutEvent,
  type CheckoutStage,
} from "@/lib/pending-checkout-store";
import { PaymentTimeline } from "@/components/customer/PaymentTimeline";
import {
  openRazorpayCheckout,
  resolveCheckoutChannel,
  type CheckoutChannel,
} from "@/lib/paymentBridge";




export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    vehicleId: typeof search.vehicleId === "string" ? search.vehicleId : undefined,
  }),
  head: () => ({ meta: [{ title: "Book service — Urban Wash" }] }),
  component: ServiceDetail,
});

type Service = {
  id: string; slug: string; name: string; description: string; banner_url: string | null;
  price_hatchback: number; price_sedan_suv: number; service_type: string; benefits: string[] | null;
  duration_minutes: number | null;
};
type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  is_default?: boolean | null;
  discount_approved?: boolean | null;
  created_at?: string | null;
};
type Address = { id: string; label: string; address_line: string; area: string; pincode: string | null; latitude?: number | null; longitude?: number | null };
type Addon = { id: string; name: string; description: string | null; price_hatchback: number; price_sedan_suv: number; applies_to_slugs: string[] };

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isMondayIso(iso: string) {
  return new Date(`${iso}T12:00:00`).getDay() === 1;
}

function nextBookableDateIso(start = new Date()) {
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

// Razorpay is handled exclusively by the shared payment service
// (src/lib/razorpay-checkout.ts). No checkout logic lives in this screen.


function ServiceDetail() {
  const { slug } = useParams({ from: "/c/_authed/service/$slug" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const logAttemptFn = useServerFn(logPaymentAttempt);
  const getStatusFn = useServerFn(getBookingPaymentStatus);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => nextBookableDateIso());
  const [slot, setSlot] = useState<string>(TIME_SLOTS[3]);
  const [notes, setNotes] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  // Payment-specific state: inline retry banner + pending checkout context.
  type PendingCheckout = {
    bookingId: string;
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    serviceName: string;
    isSubscription: boolean;
    prefillEmail: string;
    prefillContact: string;
    attemptNo: number;
  };
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [paymentError, setPaymentError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [upiUnavailable, setUpiUnavailable] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // Crash / reopen recovery: a checkout that was persisted but never finished.
  const [recovering, setRecovering] = useState(false);
  const [resumable, setResumable] = useState<PendingCheckout | null>(null);
  const [timeline, setTimeline] = useState<CheckoutEvent[]>([]);
  const [holdBlocked, setHoldBlocked] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [recoveryNonce, setRecoveryNonce] = useState(0);
  const recoveryRan = useRef(false);
  // Hard client-side lock: blocks re-entry into checkout while a payment is
  // being opened, verified or finalized (double taps, resume + retry races).
  const checkoutLockRef = useRef(false);
  const heldBookingRef = useRef<string | null>(null);
  const pollAbortRef = useRef<{ cancelled: boolean } | null>(null);
  const acquireHoldFn = useServerFn(acquireCheckoutHold);
  const releaseHoldFn = useServerFn(releaseCheckoutHold);
  useEffect(() => () => { if (pollAbortRef.current) pollAbortRef.current.cancelled = true; }, []);

  /** Persist + surface a payment timeline event. */
  const pushEvent = useCallback((bookingId: string, stage: CheckoutStage, detail?: string) => {
    const events = appendCheckoutEvent(bookingId, stage, detail);
    setTimeline(events);
  }, []);

  const acquireHold = useCallback(async (bookingId: string) => {
    try {
      const res = await acquireHoldFn({
        data: { bookingId, holderId: getCheckoutHolderId(), ttlSeconds: 300, reason: "checkout" },
      });
      if (!res?.acquired) {
        if (res?.reason === "already_paid") return { ok: false, alreadyPaid: true } as const;
        return { ok: false, alreadyPaid: false } as const;
      }
      heldBookingRef.current = bookingId;
      return { ok: true, alreadyPaid: false } as const;
    } catch (e) {
      // Never block checkout because the hold service itself is unreachable —
      // the client lock plus server-side payment verification still apply.
      console.warn("[uw-checkout] could not acquire hold (continuing)", e);
      return { ok: true, alreadyPaid: false } as const;
    }
  }, [acquireHoldFn]);

  const releaseHold = useCallback(async (bookingId: string) => {
    if (heldBookingRef.current !== bookingId) return;
    heldBookingRef.current = null;
    try {
      await releaseHoldFn({ data: { bookingId, holderId: getCheckoutHolderId() } });
    } catch (e) {
      console.warn("[uw-checkout] hold release failed (it will expire)", e);
    }
  }, [releaseHoldFn]);

  // Offline-safe recovery: remember the drop and re-verify when back online.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOffline(!navigator.onLine);
    const onOffline = () => {
      setOffline(true);
      const stored = readPendingCheckout();
      if (stored) pushEvent(stored.bookingId, "offline", "Connection lost during checkout");
    };
    const onOnline = () => {
      setOffline(false);
      const stored = readPendingCheckout();
      // Re-verify the real Razorpay status as soon as the network is back.
      if (stored && stored.serviceSlug === slug) setRecoveryNonce((n) => n + 1);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [slug, pushEvent]);




  const serviceQ = useQuery({
    queryKey: ["service", slug],
    queryFn: async (): Promise<Service | null> => {
      const { data, error } = await (supabase as any)
        .from("service_catalog").select("*").eq("slug", slug).eq("active", true).maybeSingle();
      if (error) throw error;
      return data as Service | null;
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data } = await (supabase as any).from("customer_vehicles").select("*").order("created_at");
      return (data ?? []) as Vehicle[];
    },
  });

  const addressesQ = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: async (): Promise<Address[]> => {
      const { data } = await (supabase as any).from("customer_addresses").select("*").order("created_at");
      return (data ?? []) as Address[];
    },
  });

  const addonsQ = useQuery({
    queryKey: ["service-addons", slug],
    queryFn: async (): Promise<Addon[]> => {
      const { data } = await (supabase as any).from("service_addons").select("*").eq("active", true).order("sort_order");
      return ((data ?? []) as Addon[]).filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug));
    },
  });

  // P0-DUP-01: detect an existing open Daily Shine subscription for the selected vehicle.
  const vehicleSubQ = useQuery({
    queryKey: ["vehicle-open-subscription", vehicleId],
    enabled: !!vehicleId,
    queryFn: async (): Promise<{ id: string; status: string } | null> => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("id,status")
        .eq("vehicle_id", vehicleId)
        .in("status", ["active", "awaiting_partner_assignment", "assigned"])
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });



  const search = Route.useSearch();
  const preselectVehicleId = search.vehicleId ?? null;

  useEffect(() => {
    if (vehiclesQ.data?.length) {
      // Priority: 1) explicit ?vehicleId= from Subscribe Now, 2) sessionStorage
      // selection from My Plan, 3) localStorage remembered, 4) default, 5) first.
      let session: string | null = null;
      try { session = sessionStorage.getItem("uw:selectedVehicleId"); } catch { /* noop */ }
      const stored = localStorage.getItem("uw_customer_vehicle");
      const inList = (id: string | null) => !!id && vehiclesQ.data!.some((v) => v.id === id);
      const nextVehicleId =
        (inList(preselectVehicleId) && preselectVehicleId) ||
        (inList(session) && session) ||
        (inList(stored) && stored) ||
        vehiclesQ.data.find((v) => v.is_default)?.id ||
        vehiclesQ.data[0].id;
      if (!vehicleId || !vehiclesQ.data.some((v) => v.id === vehicleId)) {
        setVehicleId(nextVehicleId!);
        localStorage.setItem("uw_customer_vehicle", nextVehicleId!);
      }
    }
  }, [vehiclesQ.data, vehicleId, preselectVehicleId]);

  useEffect(() => {
    if (!addressId && addressesQ.data?.length) {
      const def = addressesQ.data.find((a) => (a as any).is_default) ?? addressesQ.data[0];
      setAddressId(def?.id ?? null);
    }
  }, [addressesQ.data, addressId]);

  const service = serviceQ.data;
  const vehicle = vehiclesQ.data?.find((v) => v.id === vehicleId);
  const address = addressesQ.data?.find((a) => a.id === addressId);
  const isSUV = vehicle?.category === "sedan_suv";
  const isDailyShine = service?.service_type === "subscription" || service?.slug?.startsWith("daily-shine");

  useEffect(() => {
    if (isDailyShine && isMondayIso(date)) {
      setDate(nextBookableDateIso(new Date(`${date}T12:00:00`)));
    }
  }, [isDailyShine, date]);

  const selectedAddons = useMemo(
    () => Object.entries(addonQty)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ id, quantity })),
    [addonQty],
  );

  const vehicleCount = vehiclesQ.data?.length ?? 1;

  // The "first" car on the account is the earliest-created vehicle.
  // Coupons never apply to the first car — only to additional cars
  // (2nd, 3rd, 4th...). vehiclesQ is ordered by created_at asc.
  const firstVehicleId = vehiclesQ.data?.[0]?.id ?? null;
  const isFirstVehicle = !!vehicleId && vehicleId === firstVehicleId;

  const previewQ = useQuery({
    queryKey: ["booking-preview", service?.id, vehicleId, addressId, date, slot, appliedCoupon?.code ?? null, selectedAddons],
    enabled: !!service?.id && !!vehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("preview_customer_booking", {
        p_service_id: service!.id,
        p_vehicle_id: vehicleId,
        p_address_id: addressId,
        p_scheduled_date: date,
        p_scheduled_time: slot,
        p_addons: selectedAddons,
        p_coupon_code: appliedCoupon?.code ?? null,
      });
      if (error) throw error;
      return normalizeBookingPreview(data);
    },
  });

  // Discount only via coupon (multi-vehicle perk: customer must own >1 vehicle
  // AND must be booking for a car other than their first one).
  const discountPct = appliedCoupon?.percent ?? 0;
  const preview = previewQ.data ?? null;
  const previewReady = !!preview && !previewQ.isError;
  const previewPayable = previewReady ? Number(preview.payable ?? 0) : 0;
  const previewBase = Number(preview?.base_amount ?? previewPayable);
  const previewAddon = Number(preview?.addon_amount ?? 0);
  const previewDiscount = Number(preview?.discount_amount ?? 0);
  const isIncludedBooking = !!preview?.used_entitlement;
  const isEntitlementExhausted = !!preview?.exhausted;
  const addonItemsCount = Object.values(addonQty).reduce((a, b) => a + b, 0);

  // Multi-vehicle coupon: only unlocked when booking for a non-first car.
  // Admin can explicitly approve a first-vehicle exception for edge cases.
  // 2 cars → 10%, 3 cars → 15%, 4+ cars → 20%.
  const eligibleCoupon = useMemo(() => {
    if (vehicleCount < 2) return null;
    if (isFirstVehicle && !vehicle?.discount_approved) return null;
    if (vehicleCount >= 4) return { code: "MULTI20", percent: 20 };
    if (vehicleCount === 3) return { code: "EXTRA15", percent: 15 };
    return { code: "EXTRA10", percent: 10 };
  }, [vehicleCount, isFirstVehicle, vehicle?.discount_approved]);

  // If the selected vehicle changes to one that is no longer eligible
  // (e.g. user switches back to their first car), silently drop the coupon.
  useEffect(() => {
    if (appliedCoupon && !eligibleCoupon) setAppliedCoupon(null);
  }, [appliedCoupon, eligibleCoupon]);

  const applyBestCoupon = () => {
    if (vehicleCount < 2) {
      toast.error("Add another car to your account to unlock multi-car discounts.");
      return;
    }
    if (isFirstVehicle && !vehicle?.discount_approved) {
      toast.error("Coupons apply only when booking for an additional car, not your first one.");
      return;
    }
    if (!eligibleCoupon) return;
    setAppliedCoupon(eligibleCoupon);
    toast.success(`${eligibleCoupon.percent}% multi-car discount applied`);
  };

  const removeCoupon = () => setAppliedCoupon(null);

  const setQty = (id: string, q: number) => {
    setAddonQty((prev) => {
      const next = { ...prev };
      if (q <= 0) delete next[id]; else next[id] = Math.min(q, 20);
      return next;
    });
  };


  const confirm = async () => {
    const fail = (message: string) => {
      console.warn("[uw-checkout] blocked", { slug, message });
      setConfirmError(message);
      toast.error(message);
    };
    setConfirmError(null);
    if (submitting || paying) return;
    if (!service) { fail("Service is still loading. Please try again."); return; }
    if (!vehicle) { fail("Add or select a vehicle first."); return; }
    if (!date) { fail("Choose a service date."); return; }
    if (isDailyShine && isMondayIso(date)) { fail("Daily Shine does not run on Mondays. Please pick another date."); return; }
    console.log("[uw-checkout] started", {
      slug: service.slug,
      serviceType: service.service_type,
      vehicleId: vehicle.id,
      payable: previewPayable,
      includedBooking: isIncludedBooking,
      addonItemsCount,
    });
    setSubmitting(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser.user) throw new Error("Please sign in again before confirming.");

      let bookingAddressId = address?.id ?? null;
      let servicePoint = validateExactGps(address?.latitude, address?.longitude);

      if (!bookingAddressId) {
        const savedArea = localStorage.getItem("uw_customer_area")?.trim();
        const savedAddress = localStorage.getItem("uw_customer_full_address")?.trim();
        const savedPincode = localStorage.getItem("uw_customer_pincode")?.trim();
        let savedGeo: any = {};
        try { savedGeo = JSON.parse(localStorage.getItem("uw_customer_geo") ?? "{}"); } catch {}
        const exact = validateExactGps(savedGeo.lat, savedGeo.lng);

        if (savedArea && savedAddress && exact) {
          const { data: createdAddress, error: addressError } = await (supabase as any)
            .from("customer_addresses")
            .insert({
              user_id: currentUser.user.id,
              label: "Home",
              address_line: savedAddress,
              area: savedArea,
              pincode: savedPincode || savedGeo.pincode || null,
              latitude: exact.latitude,
              longitude: exact.longitude,
              is_default: true,
            })
            .select("id")
            .single();
          if (addressError) throw addressError;
          bookingAddressId = createdAddress.id;
          servicePoint = exact;
          setAddressId(createdAddress.id);
          qc.invalidateQueries({ queryKey: ["customer-addresses"] });
        } else {
          setAddrOpen(true);
          throw new Error("Exact GPS is required before booking. Please use current location and save GPS again.");
        }
      }

      const selectedAddress = addressesQ.data?.find((a) => a.id === bookingAddressId);
      if (selectedAddress) servicePoint = validateExactGps((selectedAddress as any).latitude, (selectedAddress as any).longitude);
      if (!servicePoint) {
        setAddrOpen(true);
        throw new Error("Exact GPS is required before booking. Please update this address using current location.");
      }

      // Coverage Zone validation (server-side, fail-closed).
      // The selected service address is the booking source of truth. Browser
      // localStorage GPS may be stale from a previous customer/session and was
      // causing valid polygon addresses to be rejected.
      const { error: covErr } = await supabase.rpc("assert_serviceable", {
        p_lat: servicePoint.latitude,
        p_lng: servicePoint.longitude,
        p_slug: service.slug,
      });
      if (covErr) throw new Error(covErr.message || "This service isn't available in your area yet.");

      const { data: bookingId, error } = await (supabase as any).rpc("confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
        p_address_id: bookingAddressId,
        p_scheduled_date: date,
        p_scheduled_time: slot,
        p_notes: notes || null,
        p_coupon_code: appliedCoupon?.code ?? null,
        p_addons: selectedAddons,
      });

      if (error) throw error;
      if (!bookingId) throw new Error("Booking was not created. Please try again.");
      console.log("[uw-checkout] booking created", { bookingId: String(bookingId), slug: service.slug });
      traceVehicle("customer_schedule", { booking_id: String(bookingId), vehicle_id: vehicle.id, details: { service_slug: service.slug, date, slot } });

      const { data: bookingAfterCreate, error: bookingReadError } = await (supabase as any)
        .from("bookings")
        .select("total_amount,payment_status")
        .eq("id", bookingId)
        .maybeSingle();
      if (bookingReadError) throw bookingReadError;
      const createdPayable = Number(bookingAfterCreate?.total_amount ?? previewPayable ?? 0);
      const alreadyPaid = bookingAfterCreate?.payment_status === "paid" || createdPayable <= 0;

      // Pre/Post payment is driven by admin flags on the service + each addon.
      // Default is 'pre' (online payment before work). Post-payment skips Razorpay.
      const servicePrepay = ((service as any).payment_mode ?? "pre") === "pre";
      const addonPrepay = (addonsQ.data ?? []).some((a: any) => {
        const q = addonQty[a.id] ?? 0;
        return q > 0 && ((a.payment_mode ?? "pre") === "pre");
      });
      const requiresPrepay = servicePrepay || addonPrepay;

      if (alreadyPaid || !requiresPrepay) {
        toast.success(alreadyPaid ? "Included in your Daily Shine Plan · ₹0 payable" : "Booking confirmed! You'll pay after the service is completed.");
        qc.invalidateQueries({ queryKey: ["customer-bookings"] });
        qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
        qc.invalidateQueries({ queryKey: ["vehicle-entitlements", vehicle.id] });
        // Dedicated confirmation screen instead of a toast-only handoff.
        await navigate({
          to: "/c/booking-success",
          search: {
            bookingId: service.service_type === "subscription" ? undefined : String(bookingId),
            service: service.name,
            date,
            slot: slot || undefined,
            vehicle: `${vehicle.make} ${vehicle.model}`,
            plan: service.service_type === "subscription" ? true : undefined,
          },
        });
        return;
      }


      const order = await createOrder({ data: { bookingId: String(bookingId) } });
      await appendPaymentDiagnostic("Razorpay order created", {
        bookingId: String(bookingId),
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        keyId: order.keyId,
        service: service.name,
        serviceType: service.service_type,
      });
      const prefillEmail = currentUser.user.email ?? "";
      const prefillContact = (currentUser.user.phone ?? currentUser.user.user_metadata?.phone ?? "") as string;

      const checkoutCtx: PendingCheckout = {
        bookingId: String(bookingId),
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        serviceName: service.name,
        isSubscription: service.service_type === "subscription",
        prefillEmail,
        prefillContact,
        attemptNo: 1,
      };
      setPendingCheckout(checkoutCtx);
      setResumable(null);
      savePendingCheckout({
        ...checkoutCtx,
        serviceSlug: service.slug,
        selection: {
          vehicleId: vehicle.id,
          addressId: bookingAddressId,
          date,
          slot,
          notes: notes || null,
          addonQty,
          couponCode: appliedCoupon?.code ?? null,
        },
        events: [],
      });
      pushEvent(String(bookingId), "created", `Order ${order.orderId.slice(-6)} · ₹${Math.round(order.amount / 100)}`);
      await runPayment(checkoutCtx, { isRetry: false });

    } catch (err: any) {
      fail(err?.message || "Could not confirm booking");
    } finally {
      setSubmitting(false);
    }
  };

  const safeLog = useCallback(async (row: {
    bookingId: string;
    channel: "native" | "web" | "unknown";
    outcome: "started" | "success" | "failure" | "cancelled" | "retry" | "timeout";
    attemptNo?: number;
    errorCode?: string;
    errorMessage?: string;
    providerOrderId?: string;
    providerPaymentId?: string;
    metadata?: Record<string, unknown>;
  }) => {
    try {
      await logAttemptFn({ data: row });
    } catch (e) {
      console.warn("[payment] attempt log failed (non-fatal)", e);
    }
  }, [logAttemptFn]);

  /**
   * Poll the server for payment reconciliation. Razorpay may finalize the
   * payment via webhook even if the checkout window failed to return a
   * response to the client. Polls every 2s up to ~60s, returns true if
   * the booking flips to `paid` (or a subscription is created).
   */
  const pollForSuccess = useCallback(async (bookingId: string): Promise<boolean> => {
    const abort = { cancelled: false };
    pollAbortRef.current = abort;
    const deadline = Date.now() + 60_000;
    while (!abort.cancelled && Date.now() < deadline) {
      try {
        const s = await getStatusFn({ data: { bookingId } });
        if (s.paymentStatus === "paid" || s.subscriptionId) return true;
        if (s.latestAttempt?.outcome === "success") return true;
      } catch (e) {
        console.warn("[payment] status poll error (will retry)", e);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }, [getStatusFn]);

  const runPayment = useCallback(async (ctx: PendingCheckout, opts: { isRetry: boolean }) => {
    // Client-side hold: hard re-entrancy guard around the whole attempt.
    if (checkoutLockRef.current) {
      console.warn("[uw-checkout] duplicate checkout attempt blocked (client hold)");
      return;
    }
    checkoutLockRef.current = true;
    setPaymentError(null);
    setUpiUnavailable(null);
    setHoldBlocked(null);
    setPaying(true);
    // Cancel any prior polling loop.
    if (pollAbortRef.current) pollAbortRef.current.cancelled = true;

    // Server-side hold: blocks a second tab/device from opening the same order
    // while this one is being paid, verified or finalized.
    const hold = await acquireHold(ctx.bookingId);
    if (!hold.ok) {
      checkoutLockRef.current = false;
      setPaying(false);
      setHoldBlocked(
        "This payment is already being processed on another device or tab. Wait a few moments and try again.",
      );
      pushEvent(ctx.bookingId, "failed", "Blocked — payment already in progress elsewhere");
      return;
    }
    if (hold.alreadyPaid) {
      checkoutLockRef.current = false;
      setPaying(false);
      pushEvent(ctx.bookingId, "paid", "Already paid — finalizing");
      await finalizeSuccess(ctx);
      return;
    }

    // Single shared payment service (src/lib/razorpay-checkout.ts) — this screen
    // has no Razorpay logic of its own.
    let channel: CheckoutChannel = await resolveCheckoutChannel();
    const nativeMode = channel === "native";

    await appendPaymentDiagnostic("payment attempt started", {
      bookingId: ctx.bookingId,
      channel,
      attemptNo: ctx.attemptNo,
      isRetry: opts.isRetry,
      order: { id: ctx.orderId, amount: ctx.amount, currency: ctx.currency },
      serviceName: ctx.serviceName,
      isSubscription: ctx.isSubscription,
    });

    await safeLog({
      bookingId: ctx.bookingId,
      channel,
      outcome: opts.isRetry ? "retry" : "started",
      attemptNo: ctx.attemptNo,
      providerOrderId: ctx.orderId,
    });

    try {
      if (nativeMode) {
        const nativeDiagnostics = await getNativePaymentDiagnostics();
        await appendPaymentDiagnostic("native pre-checkout diagnostics", nativeDiagnostics ?? { available: false });
        const upiPackages = (nativeDiagnostics?.upiPackages ?? {}) as Record<string, unknown>;
        const detectedCount = Number(upiPackages.detectedCount ?? 0);
        const handlerCount = Number(upiPackages.upiIntentHandlers ?? 0);
        if (nativeDiagnostics && detectedCount === 0 && handlerCount === 0) {
          const reason = "Android PackageManager reports no visible UPI apps and no upi://pay handlers before checkout.";
          setUpiUnavailable(formatUpiUnavailableMessage(nativeDiagnostics, reason, ctx.keyId));
          await appendPaymentDiagnostic("UPI unavailable pre-check", { reason });
        }
      }

      const result = await openRazorpayCheckout({
        keyId: ctx.keyId,
        orderId: ctx.orderId,
        amount: ctx.amount,
        currency: ctx.currency,
        description: ctx.serviceName,
        bookingId: ctx.bookingId,
        prefillEmail: ctx.prefillEmail,
        prefillContact: ctx.prefillContact,
        // "Opened" is only recorded once the sheet is genuinely on screen.
        onOpened: (ch) => {
          channel = ch;
          pushEvent(ctx.bookingId, "opened", `${ch === "native" ? "Native" : "Web"} checkout · attempt ${ctx.attemptNo}`);
        },
        onDiagnostic: (label, data) => { void appendPaymentDiagnostic(label, data as any); },
      });
      channel = result.channel;

      if (result.status === "cancelled") throw new Error("Payment cancelled");
      if (result.status === "failed") {
        throw Object.assign(new Error(result.message || "Payment failed"), { code: result.code });
      }

      await verifyPayment({
        data: {
          bookingId: ctx.bookingId,
          razorpayOrderId: result.orderId,
          razorpayPaymentId: result.paymentId,
          razorpaySignature: result.signature,
        },
      });


      await safeLog({
        bookingId: ctx.bookingId,
        channel,
        outcome: "success",
        attemptNo: ctx.attemptNo,
        providerOrderId: ctx.orderId,
      });
      await finalizeSuccess(ctx);
    } catch (err: any) {
      await appendPaymentDiagnostic("payment attempt failed", {
        bookingId: ctx.bookingId,
        channel,
        message: err?.message ?? String(err),
        code: err?.code,
      });
      const cancelled = /cancelled/i.test(String(err?.message ?? ""));
      // Even on cancel/failure, poll the server briefly — the webhook may
      // have already reconciled the payment out-of-band.
      const reconciled = await pollForSuccess(ctx.bookingId);
      if (reconciled) {
        await safeLog({
          bookingId: ctx.bookingId,
          channel,
          outcome: "success",
          attemptNo: ctx.attemptNo,
          providerOrderId: ctx.orderId,
          metadata: { reconciled_via: "polling" },
        });
        pushEvent(ctx.bookingId, "paid", "Verified paid after reconnecting");
        await finalizeSuccess(ctx);
        return;
      }
      await safeLog({
        bookingId: ctx.bookingId,
        channel,
        outcome: cancelled ? "cancelled" : "failure",
        attemptNo: ctx.attemptNo,
        errorCode: cancelled ? "user_cancelled" : "checkout_failed",
        errorMessage: String(err?.message ?? err).slice(0, 500),
      });
      const timedOut = /timeout|timed out/i.test(String(err?.message ?? ""));
      pushEvent(
        ctx.bookingId,
        cancelled ? "cancelled" : timedOut ? "timeout" : "failed",
        String(err?.message ?? "Checkout did not complete").slice(0, 120),
      );
      pushEvent(ctx.bookingId, "unpaid", "Server reports this booking is still unpaid");
      if (nativeMode) {
        const diag = await getNativePaymentDiagnostics();
        const reason = cancelled
          ? "Native checkout closed without a verified payment. If UPI was not visible inside Razorpay, export diagnostics from this screen."
          : String(err?.message ?? "Razorpay native checkout failed before verified payment.");
        setUpiUnavailable(formatUpiUnavailableMessage(diag, reason, ctx.keyId));
      }
      setPaymentError({
        message: cancelled
          ? "Checkout was cancelled. You can retry when you're ready."
          : (err?.message || "Payment failed. Please try again."),
        canRetry: true,
      });
    } finally {
      // Always drop both holds so a retry (or another device) can proceed.
      await releaseHold(ctx.bookingId);
      checkoutLockRef.current = false;
      setPaying(false);
    }
  }, [verifyPayment, safeLog, pollForSuccess, acquireHold, releaseHold, pushEvent]);


  const finalizeSuccess = useCallback(async (ctx: PendingCheckout) => {
    if (ctx.isSubscription) {
      toast.success("Subscription activated · Waiting for area assignment", {
        description: "We'll notify you once your first service is completed.",
        duration: 6000,
      });
    } else {
      toast.success("Payment successful · Booking confirmed", {
        description: "We'll notify you when the service is completed.",
        duration: 6000,
      });
    }
    qc.invalidateQueries({ queryKey: ["customer-bookings"] });
    qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
    const { data: u } = await supabase.auth.getUser();
    if (u.user) qc.invalidateQueries({ queryKey: ["sub-queue", u.user.id] });
    setPendingCheckout(null);
    setPaymentError(null);
    setResumable(null);
    setHoldBlocked(null);
    setTimeline([]);
    await releaseHold(ctx.bookingId);
    clearPendingCheckout();
    await navigate({
      to: "/c/booking-success",
      search: {
        bookingId: ctx.isSubscription ? undefined : ctx.bookingId,
        plan: ctx.isSubscription ? true : undefined,
      },
    });
  }, [navigate, qc, releaseHold]);

  const onRetryPayment = useCallback(async () => {
    const base = pendingCheckout ?? resumable;
    if (!base || paying || checkoutLockRef.current) return;
    const next: PendingCheckout = { ...base, attemptNo: base.attemptNo + 1 };
    setPendingCheckout(next);
    setResumable(null);
    const stored = readPendingCheckout();
    savePendingCheckout({
      ...next,
      serviceSlug: slug,
      selection: stored?.selection,
      events: stored?.events,
    });
    await runPayment(next, { isRetry: true });
  }, [pendingCheckout, resumable, paying, runPayment, slug]);


  /**
   * Crash / reopen recovery. On mount, if a checkout for this service was
   * persisted but never finished, ask the server what actually happened:
   *  - already paid  → finalize (no duplicate charge, no re-booking)
   *  - still pending → surface a "Resume payment" banner with the same order
   */
  useEffect(() => {
    if (recoveryRan.current && recoveryNonce === 0) return;
    recoveryRan.current = true;
    const stored = readPendingCheckout();
    if (!stored || stored.serviceSlug !== slug) return;
    setTimeline(stored.events ?? []);
    // Restore the selection that produced this checkout, so a reopen after an
    // offline drop shows the same cart instead of a blank form.
    if (stored.selection) {
      if (stored.selection.vehicleId) setVehicleId(stored.selection.vehicleId);
      if (stored.selection.addressId) setAddressId(stored.selection.addressId);
      if (stored.selection.date) setDate(stored.selection.date);
      if (stored.selection.slot) setSlot(stored.selection.slot);
      if (stored.selection.notes) setNotes(stored.selection.notes);
      if (stored.selection.addonQty) setAddonQty(stored.selection.addonQty);
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // Offline: keep the persisted context, verify as soon as we're back.
      setResumable({
        bookingId: stored.bookingId,
        keyId: stored.keyId,
        orderId: stored.orderId,
        amount: stored.amount,
        currency: stored.currency,
        serviceName: stored.serviceName,
        isSubscription: stored.isSubscription,
        prefillEmail: stored.prefillEmail,
        prefillContact: stored.prefillContact,
        attemptNo: stored.attemptNo,
      });
      return;
    }
    let cancelled = false;
    void (async () => {
      setRecovering(true);
      pushEvent(stored.bookingId, "verifying", "Re-checking payment status");
      try {
        const status = await getStatusFn({ data: { bookingId: stored.bookingId } });
        if (cancelled) return;
        const ctx: PendingCheckout = {
          bookingId: stored.bookingId,
          keyId: stored.keyId,
          orderId: stored.orderId,
          amount: stored.amount,
          currency: stored.currency,
          serviceName: stored.serviceName,
          isSubscription: stored.isSubscription,
          prefillEmail: stored.prefillEmail,
          prefillContact: stored.prefillContact,
          attemptNo: stored.attemptNo,
        };
        if (status.paymentStatus === "paid" || (status as any).subscriptionId) {
          console.log("[uw-checkout] recovered a completed payment", { bookingId: stored.bookingId });
          pushEvent(stored.bookingId, "paid", "Payment confirmed by Razorpay");
          await finalizeSuccess(ctx);
          return;
        }
        if (status.paymentStatus === "cancelled" || status.paymentStatus === "failed") {
          pushEvent(stored.bookingId, "unpaid", "Payment was not completed");
          clearPendingCheckout();
          return;
        }
        pushEvent(stored.bookingId, "unpaid", "Still unpaid — you can resume this order");
        setResumable(ctx);
      } catch (e) {
        console.warn("[uw-checkout] recovery status check failed", e);
      } finally {
        if (!cancelled) setRecovering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, recoveryNonce, getStatusFn, finalizeSuccess, pushEvent]);


  const onDiscardResumable = useCallback(() => {
    setResumable(null);
    setTimeline([]);
    setHoldBlocked(null);
    clearPendingCheckout();
  }, []);

  const onDismissPaymentError = useCallback(() => {
    setPaymentError(null);
    if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
  }, []);


  const onExportPaymentDiagnostics = useCallback(async () => {
    try {
      const result = await exportPaymentDiagnosticsFile();
      toast.success("Payment diagnostics exported", {
        description: String(result?.message ?? result?.filename ?? "payment-diagnostics.txt"),
      });
    } catch (error: any) {
      toast.error(error?.message ?? "Could not export diagnostics");
    }
  }, []);



  if (serviceQ.isLoading) {
    return <div className="px-5 pt-10"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  }
  if (!service) {
    return (
      <div className="px-5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Service not found.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/c/home">Back to home</Link></Button>
      </div>
    );
  }

  return (
    <div className="pb-32">
      {/* Banner */}
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-primary/20 via-accent to-card">
        <button onClick={() => navigate({ to: "/c/home" })}
          className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-card/90 backdrop-blur">
          <ArrowLeft className="h-4 w-4" />
        </button>
        {service.banner_url ? (
          <img src={service.banner_url} alt={service.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-primary">
            <Sparkles className="h-14 w-14" />
          </div>
        )}
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>

        {service.benefits?.length ? (
          <ul className="mt-4 space-y-1.5">
            {service.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Vehicle */}
        <SectionCard icon={<Car className="h-4 w-4" />} title="Vehicle" hint={vehicle ? "Change" : "Add"}>
          {vehiclesQ.data?.length ? (
            <select value={vehicleId ?? ""} onChange={(e) => { setVehicleId(e.target.value); localStorage.setItem("uw_customer_vehicle", e.target.value); }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
              {vehiclesQ.data.map((v) => (
                <option key={v.id} value={v.id}>{v.make} {v.model} · {v.registration_number}</option>
              ))}
            </select>
          ) : (
            <Button asChild variant="outline" size="sm"><Link to="/c/vehicles/add"><Plus className="mr-1 h-4 w-4" /> Add vehicle</Link></Button>
          )}
        </SectionCard>

        {/* Address */}
        <SectionCard icon={<MapPin className="h-4 w-4" />} title="Service address">
          {addressesQ.data?.length ? (
            <div className="space-y-2">
              {addressesQ.data.map((a) => (
                <button key={a.id} onClick={() => setAddressId(a.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm ${
                    addressId === a.id ? "border-primary bg-accent" : "border-border hover:bg-muted"
                  }`}>
                  <div className="flex-1">
                    <div className="font-medium">{a.label || "Address"}</div>
                    <div className="text-xs text-muted-foreground">{a.address_line}, {a.area} {a.pincode ?? ""}</div>
                  </div>
                </button>
              ))}
              <Button onClick={() => setAddrOpen(true)} variant="outline" size="sm" className="w-full">
                <Plus className="mr-1 h-4 w-4" /> Add new address
              </Button>
            </div>
          ) : (
            <Button onClick={() => setAddrOpen(true)} variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add address</Button>
          )}
        </SectionCard>

        {/* Add-ons */}
        {previewReady && !isIncludedBooking && addonsQ.data && addonsQ.data.length > 0 && (
          <SectionCard icon={<Sparkles className="h-4 w-4" />} title="Add-ons" hint="Tap + to add more">
            <div className="space-y-2">
              {addonsQ.data.map((a) => {
                const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
                const q = addonQty[a.id] ?? 0;
                const active = q > 0;
                return (
                  <div key={a.id}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 ${
                      active ? "border-primary bg-accent" : "border-border"
                    }`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.name}</div>
                      {a.description && <div className="mt-0.5 text-[11px] text-muted-foreground">{a.description}</div>}
                      <div className="mt-1 text-[11px] text-muted-foreground">+₹{p} each{q > 1 ? ` · ₹${p * q} total` : ""}</div>
                    </div>
                    {q === 0 ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setQty(a.id, 1)} className="shrink-0 rounded-full">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2 rounded-full border border-primary bg-card px-1 py-0.5">
                        <button type="button" onClick={() => setQty(a.id, q - 1)} aria-label="Decrease"
                          className="grid h-7 w-7 place-items-center rounded-full hover:bg-muted">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-sm font-semibold">{q}</span>
                        <button type="button" onClick={() => setQty(a.id, q + 1)} aria-label="Increase"
                          className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}


        {/* Date + Slot */}
        <SectionCard icon={<Calendar className="h-4 w-4" />} title="When">
          <Input
            type="date"
            min={toIsoDate(new Date())}
            value={date}
            onChange={(e) => {
              const next = e.target.value;
              if (isDailyShine && isMondayIso(next)) {
                toast.error("Daily Shine does not run on Mondays. Please pick another date.");
                setDate(nextBookableDateIso(new Date(`${next}T12:00:00`)));
                return;
              }
              setDate(next);
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((s) => (
              <button key={s} onClick={() => setSlot(s)}
                className={`rounded-xl border py-2 text-xs font-medium ${
                  slot === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                }`}>
                {s}
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Multi-car discount */}
        {previewReady && !isIncludedBooking && <SectionCard
          icon={<Sparkles className="h-4 w-4" />}
          title="Multi-car discount"
          hint={`${vehicleCount} car${vehicleCount === 1 ? "" : "s"} on account`}
        >
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm">
              <div>
                <div className="font-semibold text-success">{appliedCoupon.percent}% off applied</div>
                <div className="text-[11px] text-muted-foreground">Multi-car discount auto-applied</div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={removeCoupon}>Remove</Button>
            </div>
          ) : eligibleCoupon ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold">You unlock {eligibleCoupon.percent}% off</div>
                <div className="text-[11px] text-muted-foreground">For having {vehicleCount} cars on Daily Shine</div>
              </div>
              <Button type="button" size="sm" onClick={applyBestCoupon} className="shrink-0 rounded-full">Apply coupon</Button>
            </div>
          ) : isFirstVehicle && vehicleCount >= 2 && !vehicle?.discount_approved ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              Coupons apply only when you book service for an additional car — not your first one.
              Switch the car above to a different vehicle to unlock your multi-car discount.
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
              Add another car to unlock multi-car discounts on the next car: 2 cars → 10%, 3 cars → 15%, 4 cars → 20%.
              <div className="mt-2">
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link to="/c/vehicles/add">Add another car</Link>
                </Button>
              </div>
            </div>
          )}
        </SectionCard>}

        {/* Summary */}
        <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-sm">
          {!previewReady ? (
            <Row label="Checking plan"><span>…</span></Row>
          ) : isIncludedBooking ? (
            <>
              <Row label={INCLUDED_PLAN_MESSAGE}><span className="text-success">₹0</span></Row>
              <div className="mt-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                ₹0 Payable
              </div>
            </>
          ) : (
            <>
              {isEntitlementExhausted && (
                <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {exhaustedEntitlementMessage(preview)}
                </div>
              )}
              <Row label="Base"><span>₹{previewBase}</span></Row>
              {previewAddon > 0 && <Row label={`Add-ons (${addonItemsCount})`}><span>₹{previewAddon}</span></Row>}
            </>
          )}
          {!isIncludedBooking && appliedCoupon && previewDiscount > 0 && (
            <Row label={`Coupon ${appliedCoupon.code} (${discountPct}%)`}>
              <span className="text-success">−₹{previewDiscount}</span>
            </Row>
          )}
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
            <span className="font-semibold">{isIncludedBooking ? "Payable" : "Total"}</span>
            <span className="text-lg font-semibold">{!previewReady ? "…" : `₹${previewPayable}`}</span>
          </div>
        </div>
      </div>

      {/* Sticky checkout bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-md px-5 py-3">
          {offline ? (
            <div
              role="status"
              data-testid="payment-offline-banner"
              className="mb-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-[11px] leading-snug text-amber-800"
            >
              You're offline. Your selection and pending order are saved — we'll re-check the payment
              automatically when you're back online.
            </div>
          ) : null}
          {holdBlocked ? (
            <div
              role="alert"
              data-testid="payment-hold-banner"
              className="mb-2 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-[11px] leading-snug text-amber-900"
            >
              {holdBlocked}
            </div>
          ) : null}
          <PaymentTimeline events={timeline} />
          {recovering ? (
            <div
              data-testid="payment-recovery-checking"
              className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Checking your last payment status…
            </div>
          ) : null}

          {!recovering && resumable && !paymentError ? (
            <div
              role="status"
              data-testid="payment-resume-banner"
              className="mb-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-[12px] leading-snug"
            >
              <div className="font-medium">Unfinished payment for this booking</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Your booking is saved and still unpaid — ₹{Math.round(resumable.amount / 100)} for {resumable.serviceName}.
                Resume to reopen the same payment (Order {resumable.orderId.slice(-6)}).
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={onRetryPayment}
                  disabled={paying}
                  data-testid="payment-resume-btn"
                  className="h-7 rounded-full px-3 text-[11px]"
                >
                  {paying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Resume payment
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDiscardResumable}
                  className="h-7 rounded-full px-2 text-[11px] text-muted-foreground"
                  data-testid="payment-resume-discard"
                >
                  <X className="mr-1 h-3 w-3" /> Start over
                </Button>
              </div>
            </div>
          ) : null}
          {paymentError ? (

            <div
              role="alert"
              data-testid="payment-error-banner"
              className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] leading-snug text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Payment couldn’t complete</div>
                <div className="mt-0.5 text-[11px] text-destructive/90">{paymentError.message}</div>
                {pendingCheckout ? (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Attempt {pendingCheckout.attemptNo} · Order {pendingCheckout.orderId.slice(-6)}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  {paymentError.canRetry && pendingCheckout ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={onRetryPayment}
                      disabled={paying}
                      data-testid="payment-retry-btn"
                      className="h-7 rounded-full px-3 text-[11px]"
                    >
                      {paying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                      Retry checkout
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onDismissPaymentError}
                    className="h-7 rounded-full px-2 text-[11px] text-muted-foreground"
                    data-testid="payment-error-dismiss"
                  >
                    <X className="mr-1 h-3 w-3" /> Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onExportPaymentDiagnostics}
                    className="h-7 rounded-full px-2 text-[11px] text-muted-foreground"
                    data-testid="payment-diagnostics-export"
                  >
                    Export diagnostics
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {upiUnavailable ? (
            <div
              role="status"
              data-testid="upi-unavailable-banner"
              className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950 whitespace-pre-line"
            >
              <div className="font-semibold">UPI unavailable</div>
              <div className="mt-1">{upiUnavailable}</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onExportPaymentDiagnostics}
                className="mt-2 h-7 rounded-full px-3 text-[11px]"
                data-testid="upi-unavailable-export"
              >
                Export payment diagnostics
              </Button>
            </div>
          ) : null}
          {service?.service_type === "subscription" && !isIncludedBooking && vehicleSubQ.data ? (
            <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900">
              This vehicle already has an active Daily Shine subscription. You can still buy extra washes and premium services —{" "}
              <Link to="/c/home" className="font-semibold underline">browse extra services</Link>.
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-xl font-semibold">{!previewReady ? "Checking…" : isIncludedBooking ? "₹0 Payable" : `₹${previewPayable}`}</div>
              <div className="text-[10px] text-muted-foreground">
                {isIncludedBooking ? INCLUDED_PLAN_MESSAGE : previewPayable > 0 ? "Secure Razorpay checkout" : "Pay after service · receipt created after confirm"}
              </div>
              {confirmError ? <div className="mt-1 max-w-[12rem] text-[11px] font-medium text-destructive">{confirmError}</div> : null}
            </div>
            <Button
              type="button"
              onClick={() => {
                void confirm().catch((e: any) => {
                  console.error("[uw-checkout] unhandled checkout error", e);
                  setSubmitting(false);
                  setConfirmError(e?.message || "Something went wrong. Please try again.");
                });
              }}
              disabled={submitting || paying || !previewReady || (service?.service_type === "subscription" && !isIncludedBooking && !!vehicleSubQ.data)}
              size="lg"
              className="rounded-full px-6"
              data-testid="pay-button"
            >
              {(submitting || paying) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {isIncludedBooking ? "Book Included Service" : previewPayable > 0 ? "Pay" : "Confirm"} <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>



      <AddressDialog open={addrOpen} onOpenChange={setAddrOpen} onCreated={(id) => { setAddressId(id); qc.invalidateQueries({ queryKey: ["customer-addresses"] }); }} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-1.5 flex items-baseline justify-between"><span className="text-muted-foreground">{label}</span>{children}</div>;
}

function SectionCard({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{icon}</span> {title}
        </div>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function AddressDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [label, setLabel] = useState("Home");
  const [line, setLine] = useState("");
  const [area, setArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (line.trim().length < 4) { toast.error("Enter a valid address"); return; }
    let savedGeo: any = {};
    try { savedGeo = JSON.parse(localStorage.getItem("uw_customer_geo") ?? "{}"); } catch {}
    const exact = validateExactGps(savedGeo.lat, savedGeo.lng);
    if (!exact) { toast.error(GPS_INVALID_MESSAGE); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { data, error } = await (supabase as any).from("customer_addresses").insert({
      user_id: u.user.id, label, address_line: line.trim(), area: area.trim(),
      pincode: pincode || savedGeo.pincode || null, parking_notes: notes || null,
      latitude: exact.latitude, longitude: exact.longitude, is_default: true,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address saved");
    onCreated(data.id);
    onOpenChange(false);
    setLine(""); setArea(""); setPincode(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add address</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {["Home", "Work", "Other"].map((l) => (
              <button key={l} onClick={() => setLabel(l)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  label === l ? "border-primary bg-primary text-primary-foreground" : "border-border"
                }`}>{l}</button>
            ))}
          </div>
          <div><Label>Flat / House / Street</Label><Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="A-203, Greens Apt" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Area</Label><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Sector 18" /></div>
            <div><Label>Pincode</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} maxLength={6} /></div>
          </div>
          <div><Label>Parking notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Exact GPS is mandatory for Daily Shine navigation. Use the location screen so your partner never gets an area centroid.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save address</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
