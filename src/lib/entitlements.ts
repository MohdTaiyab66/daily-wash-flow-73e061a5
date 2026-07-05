export type BookingPreview = {
  payable: number;
  used_entitlement: boolean;
  remaining_after_booking?: Record<string, number | null> | null;
  remaining_before_booking?: number | null;
  benefit_type?: string | null;
  subscription_id?: string | null;
  exhausted?: boolean;
  message?: string | null;
  base_amount?: number;
  addon_amount?: number;
  discount_amount?: number;
  total_amount?: number;
};

export const INCLUDED_PLAN_MESSAGE = "Included in your Daily Shine Plan";

export function normalizeBookingPreview(value: unknown): BookingPreview {
  const raw = (value ?? {}) as Partial<BookingPreview>;
  return {
    ...raw,
    payable: Number(raw.payable ?? raw.total_amount ?? 0),
    used_entitlement: Boolean(raw.used_entitlement),
    remaining_after_booking: raw.remaining_after_booking ?? null,
    message: raw.message ?? null,
  };
}

export function entitlementBenefitLabel(benefit?: string | null) {
  switch (benefit) {
    case "interior":
      return "Interior Washes";
    case "exterior_daily":
      return "Exterior Washes";
    case "exterior_hydrophobic":
      return "Hydrophobic Exterior Washes";
    case "dusting":
      return "Dusting";
    case "tyre_polish":
      return "Tyre Polish";
    case "paper_mats":
      return "Paper Mats";
    case "fragrance":
      return "Fragrance Spray";
    default:
      return "included benefits";
  }
}

export function exhaustedEntitlementMessage(preview?: BookingPreview | null) {
  return `You've used all ${entitlementBenefitLabel(preview?.benefit_type)} included in your plan. This booking will be charged as an add-on.`;
}