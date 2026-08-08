import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Calendar, Car, ChevronRight, Loader2, MapPin, Plus, RefreshCw, Sparkles, Minus, X, Check, Clock, CheckCircle2 } from "lucide-react";
import { BookAWashSheet } from "@/components/customer/BookAWashSheet";

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
  appendCheckoutEvent,
  clearPendingCheckout,
  getCheckoutHolderId,
  readPendingCheckout,
  savePendingCheckout,
  type CheckoutEvent,
  type CheckoutStage,
} from "@/lib/pending-checkout-store";
import { SectionTitle, Section, Surface, StatusChip, PageTitle, Muted } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { PaymentTimeline } from "@/components/customer/PaymentTimeline";
import { openRazorpayCheckout } from "@/lib/paymentBridge";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";




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

function BenefitItem({ icon: Icon, label, sub }: { icon: any; label: string; sub: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] font-black text-foreground">{label}</div>
      <div className="text-[10px] font-medium text-muted-foreground/60">{sub}</div>
    </div>
  );
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
  const [bookOpen, setBookOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);


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
      
      const normalized = normalizeBookingPreview(data);
      
      // HARD GUARD: If vehicle has an active sub, base amount MUST be 0
      // unless we are renewing or it's a specific paid upgrade.
      if (vehicleSubQ.data?.status === 'active' && !isIncludedBooking) {
        normalized.base_amount = 0;
        normalized.payable = Number(normalized.addon_amount ?? 0);
      }
      
      return normalized;

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
    if (vehicleSubQ.data?.status === 'active' && previewBase > 0) {
      fail("This vehicle already has an active Daily Shine subscription.");
      return;
    }

    if (vehicleSubQ.data?.status === 'active' && previewBase > 0) {
      fail("This vehicle already has an active Daily Shine subscription.");
      return;
    }

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

    // Single native payment layer (src/lib/paymentBridge.ts) — this screen has
    // no Razorpay logic of its own.
    const channel = "native" as const;

    await safeLog({
      bookingId: ctx.bookingId,
      channel,
      outcome: opts.isRetry ? "retry" : "started",
      attemptNo: ctx.attemptNo,
      providerOrderId: ctx.orderId,
    });

    try {
      const result = await openRazorpayCheckout({
        keyId: ctx.keyId,
        orderId: ctx.orderId,
        amount: ctx.amount,
        currency: ctx.currency,
        description: ctx.serviceName,
        bookingId: ctx.bookingId,
        prefillEmail: ctx.prefillEmail,
        prefillContact: ctx.prefillContact,
        onOpened: () => {
          pushEvent(ctx.bookingId, "opened", `Checkout · attempt ${ctx.attemptNo}`);
        },
      });


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
      console.warn("[uw-checkout] payment attempt failed", {
        bookingId: ctx.bookingId,
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







  const uniqueAddresses = useMemo(() => {
    const seen = new Set<string>();
    return (addressesQ.data ?? []).filter((addr) => {
      const key = `${addr.address_line.trim().toLowerCase()}|${addr.area.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [addressesQ.data]);

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
    <div className="min-h-screen bg-[#FFF9F3] pb-32">
      <header className="sticky top-0 z-20 flex items-center gap-4 bg-[#FFF9F3]/95 px-5 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/c/home" })} className="grid h-9 w-9 place-items-center rounded-full bg-card shadow-sm transition-transform active:scale-90">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <PageTitle className="text-[17px]">{service.name}</PageTitle>
          <Muted className="truncate">{vehicleSubQ.data?.status === 'active' ? 'Active on this vehicle' : 'Your car, clean every day'}</Muted>
        </div>
        {vehicleSubQ.data?.status === 'active' && (
          <div className="ml-auto">
            <StatusChip tone="success" className="font-black uppercase tracking-widest text-[9px]">Active Plan</StatusChip>
          </div>
        )}
      </header>

      <div className="px-5 pb-6">
        {vehicleSubQ.data?.status === 'active' ? (
          <Surface className="relative overflow-hidden border-success/20 bg-success/5 mb-6 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-success font-black">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-[17px]">Daily Shine is Active</span>
                </div>
                <p className="mt-1 text-[13px] font-medium text-success/70">You already have a subscription for this vehicle.</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="rounded-xl border-success/20 bg-white text-success font-bold text-[12px]">
                    <Link to="/c/subscriptions">View My Plan</Link>
                  </Button>
                  <Button size="sm" onClick={() => setBookOpen(true)} className="rounded-xl bg-success text-white font-bold text-[12px] hover:bg-success/90">
                    Book Included Wash
                  </Button>
                </div>
              </div>
              <Sparkles className="h-10 w-10 text-success/20" />
            </div>
          </Surface>
        ) : (
          <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED]">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h2 className="text-[20px] font-black text-foreground">{service.name}</h2>
                <p className="mt-1 text-[13px] font-medium text-muted-foreground/70">{service.description || "Premium doorstep car care"}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[28px] font-black text-primary">₹{previewPayable}</span>
                  <span className="text-[14px] font-bold text-muted-foreground/50">/ month</span>
                </div>
              </div>
              <div className="rounded-full bg-[#FFE6D6] px-3 py-1 text-[11px] font-black text-primary uppercase tracking-widest">Best Value</div>
            </div>
            
            <div className="mt-6 grid grid-cols-3 gap-2 border-t border-black/5 pt-4">
               <BenefitItem icon={Car} label="26 Daily" sub="Exterior" />
               <BenefitItem icon={Sparkles} label="1 Premium" sub="Monthly" />
               <BenefitItem icon={MapPin} label="Doorstep" sub="Service" />
            </div>
            <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-primary/5 blur-3xl" />
          </Surface>
        )}


        <Section title={<><Car className="h-4 w-4 text-primary" /> Your vehicle</>}>
          <Drawer>
            <DrawerTrigger asChild>
              <Surface className="flex items-center justify-between p-3 active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center">
                    <Car className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-[14px] font-black">{vehicle?.make} {vehicle?.model || "Select Car"}</div>
                    <div className="text-[12px] font-medium text-muted-foreground/60">{vehicle?.registration_number || "No vehicle selected"}</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Surface>
            </DrawerTrigger>
            <DrawerContent className="max-h-[80vh]">
              <DrawerHeader><DrawerTitle>Select Vehicle</DrawerTitle></DrawerHeader>
              <div className="px-4 py-2 space-y-2 overflow-y-auto">
                {(vehiclesQ.data || []).map(v => (
                  <DrawerClose key={v.id} asChild>
                    <button 
                      onClick={() => setVehicleId(v.id)}
                      className={cn("w-full text-left p-4 rounded-xl border flex items-center justify-between", vehicleId === v.id ? "border-primary bg-primary/5 shadow-sm" : "border-black/5")}
                    >
                      <div>
                        <div className="font-black text-[15px]">{v.make} {v.model}</div>
                        <div className="text-xs font-medium text-muted-foreground/60">{v.registration_number}</div>
                      </div>
                      {vehicleId === v.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </button>
                  </DrawerClose>
                ))}
              </div>
              <DrawerFooter>
                <Button asChild variant="outline" className="w-full h-12 rounded-xl font-bold border-black/5 transition-transform active:scale-95"><Link to="/c/vehicles/add">Add another car</Link></Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </Section>

        <Section title={<><MapPin className="h-4 w-4 text-primary" /> Service location</>}>
          <Drawer>
            <DrawerTrigger asChild>
              <Surface className="flex items-start gap-3 p-3 active:scale-[0.98] transition-transform">
                <div className="mt-1 h-5 w-5 rounded-full border-2 border-primary/20 bg-primary/10 flex items-center justify-center shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-black">
                    {uniqueAddresses.find(a => a.id === addressId)?.label ?? "Default Location"}
                  </div>
                  <div className="text-[12px] font-medium text-muted-foreground/60 truncate">
                    {uniqueAddresses.find(a => a.id === addressId)?.address_line ?? "Select your address"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </Surface>
            </DrawerTrigger>
            <DrawerContent className="max-h-[80vh]">
              <DrawerHeader><DrawerTitle>Select Location</DrawerTitle></DrawerHeader>
              <div className="px-4 py-2 space-y-2 overflow-y-auto">
                {uniqueAddresses.map(addr => (
                  <DrawerClose key={addr.id} asChild>
                    <button 
                      onClick={() => setAddressId(addr.id)}
                      className={cn("w-full text-left p-4 rounded-xl border", addressId === addr.id ? "border-primary bg-primary/5" : "border-black/5")}
                    >
                      <div className="font-black text-[15px]">{addr.label}</div>
                      <div className="text-xs font-medium text-muted-foreground/60">{addr.address_line}, {addr.area}</div>
                    </button>
                  </DrawerClose>
                ))}
              </div>
              <DrawerFooter>
                <Button onClick={() => setAddrOpen(true)} variant="outline" className="h-12 rounded-xl font-bold border-black/5 transition-transform active:scale-95">Add new address</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </Section>

        <Section title={<><Calendar className="h-4 w-4 text-primary" /> Your first service</>}>
          <div className="mb-4 text-[14px] font-black text-foreground px-1 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {date === new Date().toISOString().split("T")[0] ? "Today" : "Tomorrow"} · {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((s) => (
              <button key={s} onClick={() => setSlot(s)}
                className={cn("rounded-xl border py-3 text-[12px] font-black transition-all active:scale-95", 
                  slot === s ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-black/5 bg-white text-muted-foreground")}>
                {s}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] font-medium text-muted-foreground/60">🕐 Your partner may arrive anytime within this window.</p>
        </Section>

        <Section 
          title={<><Sparkles className="h-4 w-4 text-primary" /> Make it even better</>} 
          action={
            <Drawer>
              <DrawerTrigger asChild>
                <button className="text-[13px] font-black text-primary transition-transform active:scale-95">View all ›</button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader>
                  <DrawerTitle>Additional Services</DrawerTitle>
                  <DrawerDescription>One-time treatments for your vehicle</DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-12 space-y-3 overflow-y-auto">
                   {addonsQ.data?.map((a) => {
                     const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
                     const qty = addonQty[a.id] || 0;
                     return (
                      <div key={a.id} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                         <div className="min-w-0 flex-1">
                           <div className="text-[15px] font-black text-[#1a1a1a]">{a.name}</div>
                           <div className="text-[12px] font-medium text-muted-foreground/60 line-clamp-1">{a.description}</div>
                           <div className="mt-1 text-[13px] font-black text-primary">₹{p}</div>
                         </div>
                         <div className="ml-4 shrink-0">
                           {qty > 0 ? (
                              <div className="flex items-center gap-2 bg-primary/5 rounded-full p-1 border border-primary/20 shadow-inner">
                                  <button onClick={() => setQty(a.id, qty - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white border border-black/5 shadow-sm active:scale-90 transition-transform"><Minus className="h-3 w-3" /></button>
                                  <span className="text-[13px] font-black w-4 text-center">{qty}</span>
                                  <button onClick={() => setQty(a.id, qty + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white border border-black/5 shadow-sm active:scale-90 transition-transform"><Plus className="h-3 w-3" /></button>
                              </div>
                           ) : (
                              <Button size="sm" variant="outline" className="rounded-full h-9 px-5 font-black border-primary/20 text-primary hover:bg-primary/5 active:scale-95 transition-transform" onClick={() => setQty(a.id, 1)}>+ Add</Button>
                           )}
                         </div>
                      </div>
                     )
                   })}
                </div>
              </DrawerContent>
            </Drawer>
          }
        >
           {addonsQ.data?.slice(0, 2).map((a) => {
             const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
             const qty = addonQty[a.id] || 0;
             return (
              <div key={a.id} className="mb-2 flex items-center justify-between rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                 <div>
                   <div className="text-[14px] font-black text-[#1a1a1a]">{a.name}</div>
                   <div className="text-[12px] font-medium text-muted-foreground/60">₹{p}</div>
                 </div>
                 {qty > 0 ? (
                    <div className="flex items-center gap-3 bg-primary/5 rounded-full p-1 border border-primary/20 shadow-inner">
                        <button onClick={() => setQty(a.id, qty - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white border border-black/5 shadow-sm active:scale-90 transition-transform"><Minus className="h-3 w-3" /></button>
                        <span className="text-[13px] font-black w-4 text-center">{qty}</span>
                        <button onClick={() => setQty(a.id, qty + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-white border border-black/5 shadow-sm active:scale-90 transition-transform"><Plus className="h-3 w-3" /></button>
                    </div>
                 ) : (
                    <button className="text-[13px] font-black text-primary px-4 py-2 rounded-full border border-primary/20 hover:bg-primary/5 active:scale-95 transition-transform" onClick={() => setQty(a.id, 1)}>+ Add</button>
                 )}
              </div>
             )
           })}
        </Section>

        {/* PRICE SUMMARY */}
        <Section title="Your total">
           <Surface className="space-y-3 p-4">
              <div className="flex justify-between text-[14px] font-medium text-muted-foreground/70"><span>Daily Shine</span><span>₹{previewBase}</span></div>
              <div className="flex justify-between text-[14px] font-medium text-muted-foreground/70"><span>Add-ons</span><span>₹{previewAddon}</span></div>
              {previewDiscount > 0 && <div className="flex justify-between text-[14px] font-black text-success"><span>Discount</span><span>-₹{previewDiscount}</span></div>}
              <div className="flex justify-between pt-3 text-[17px] font-black border-t border-black/5 text-[#1a1a1a]"><span>Total per month</span><span>₹{previewPayable}</span></div>
           </Surface>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-5 pt-4 pb-8 backdrop-blur shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
        <div className="mx-auto max-w-md">
          <Button size="lg" className="h-16 w-full rounded-2xl text-[17px] font-black shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform" onClick={() => confirm()} disabled={submitting || paying}>
            {submitting || paying ? (
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            ) : (
              <div className="flex w-full items-center justify-between px-2">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[13px] opacity-70 font-medium">Total Payable</span>
                  <span className="text-[18px]">₹{previewPayable}</span>
                </div>
                <div className="flex items-center gap-1 font-black">
                  Subscribe <ChevronRight className="h-5 w-5" />
                </div>
              </div>
            )}
          </Button>
        </div>
      </div>

      <AddressDialog open={addrOpen} onOpenChange={setAddrOpen} onCreated={(id) => { setAddressId(id); qc.invalidateQueries({ queryKey: ["customer-addresses"] }); }} />
    </div>
  );

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
      <DialogContent className="max-w-md rounded-[32px] border-none shadow-2xl">
        <DialogHeader className="pb-2"><DialogTitle className="text-xl font-black">Add new address</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex gap-2 p-1 bg-black/5 rounded-2xl">
            {["Home", "Work", "Other"].map((l) => (
              <button key={l} onClick={() => setLabel(l)}
                className={cn("flex-1 py-2.5 text-[13px] font-black rounded-xl transition-all", 
                  label === l ? "bg-white text-primary shadow-sm" : "text-muted-foreground/60"
                )}>{l}</button>
            ))}
          </div>
          <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Flat / House / Street</Label><Input value={line} className="h-12 rounded-xl bg-black/5 border-none" onChange={(e) => setLine(e.target.value)} placeholder="A-203, Greens Apt" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Area</Label><Input value={area} className="h-12 rounded-xl bg-black/5 border-none" onChange={(e) => setArea(e.target.value)} placeholder="Sector 18" /></div>
            <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Pincode</Label><Input value={pincode} className="h-12 rounded-xl bg-black/5 border-none" onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} maxLength={6} placeholder="400001" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-[13px] font-black ml-1">Parking notes (optional)</Label><Textarea value={notes} className="rounded-xl bg-black/5 border-none min-h-[80px]" onChange={(e) => setNotes(e.target.value)} placeholder="Wait at the gate..." /></div>
        </div>
        <DialogFooter className="pt-4 sm:justify-between gap-3">
          <Button variant="ghost" className="h-12 rounded-xl font-black text-muted-foreground transition-transform active:scale-95" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} className="h-12 rounded-xl font-black px-8 transition-transform active:scale-95" disabled={saving}>{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save address"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
