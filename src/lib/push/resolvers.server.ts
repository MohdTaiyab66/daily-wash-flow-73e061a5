/**
 * Canonical Server-side Resolvers for Partner Push Notifications.
 *
 * Ensures consistent Earning and Distance values across Push and App UI.
 * FORENSIC MARKERS: [PARTNER-BOOKING-CONTEXT:*]
 */

import { haversineKm } from "@/lib/assignment.functions";

type LatLng = { lat: number; lng: number };

/**
 * Helper to calculate working days in a billing cycle.
 */
function calculateWorkingDays(start?: string | null, end?: string | null) {
  if (!start || !end) return 26; // Default to standard 26-day cycle
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const days = Math.max(1, Math.floor((e - s) / 86400000) + 1); // Inclusive
  return Math.min(Math.max(days, 7), 31); // Business rule: min 7 days for earnings resolution
}

/**
 * Resolves the partner's expected earning for a specific booking/offer.
 * Currently uses the marketplace incentive as the primary earning source.
 */
export async function resolvePartnerBookingEarning(params: {
  sb: any;
  offerId: string;
  partnerId: string;
  incentive: number;
}) {
  console.log(`[PARTNER-BOOKING-CONTEXT:01] BOOKING_CONTEXT_START partner=${params.partnerId} offer=${params.offerId}`);
  
  // Existing business rule: Earning = Marketplace Incentive
  const amount = params.incentive;
  
  console.log(`[PARTNER-BOOKING-CONTEXT:02] EARNING_RESOLVED partner=${params.partnerId} amount=${amount}`);
  
  return {
    amount,
    display: `₹${amount}`
  };
}

/**
 * Resolves the estimated TOTAL MONTHLY EARNING from a vehicle/service.
 */
export async function resolvePartnerMonthlyEarning(params: {
  sb: any;
  partnerId: string;
  incentive: number;
  startDate?: string | null;
  renewalDate?: string | null;
}) {
  const { incentive, startDate, renewalDate } = params;
  
  // Earning per service day = incentive
  const workingDays = calculateWorkingDays(startDate, renewalDate);
  const monthlyAmount = incentive * workingDays;
  
  console.log(`[PARTNER-BOOKING-CONTEXT:02-MONTHLY] EARNING_RESOLVED partner=${params.partnerId} daily=${incentive} days=${workingDays} monthly=${monthlyAmount}`);
  
  return {
    dailyAmount: incentive,
    monthlyAmount,
    workingDays,
    display: `+₹${monthlyAmount}/month`
  };
}

/**
 * Resolves the distance from the partner's nearest relevant location context
 * to the customer's service location.
 */
export async function resolvePartnerBookingDistance(params: {
  sb: any;
  partnerId: string;
  customerLat: number | null;
  customerLng: number | null;
}) {
  const { sb, partnerId, customerLat, customerLng } = params;
  
  if (!customerLat || !customerLng) {
    console.log(`[PARTNER-BOOKING-CONTEXT:03] DISTANCE_RESOLVED partner=${partnerId} distance_km=null reason=missing_customer_loc`);
    return { km: null, display: "Distance unavailable" };
  }

  // 1. Try to get Partner's current/last known location from attendance/availability
  const { data: attendance } = await sb
    .from("attendance")
    .select("latitude, longitude")
    .eq("partner_id", partnerId)
    .not("latitude", "is", null)
    .order("marked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let partnerLoc: LatLng | null = null;
  if (attendance?.latitude && attendance?.longitude) {
    partnerLoc = { lat: Number(attendance.latitude), lng: Number(attendance.longitude) };
  }

  // 2. Fallback to Partner's home zone centroid if GPS is unavailable
  if (!partnerLoc) {
    const { data: partner } = await sb
      .from("partners")
      .select("home_zone_id")
      .eq("id", partnerId)
      .maybeSingle();
    
    if (partner?.home_zone_id) {
      const { data: zone } = await sb
        .from("coverage_zones")
        .select("latitude, longitude")
        .eq("id", partner.home_zone_id)
        .maybeSingle();
      
      if (zone?.latitude && zone?.longitude) {
        partnerLoc = { lat: Number(zone.latitude), lng: Number(zone.longitude) };
      }
    }
  }

  if (!partnerLoc) {
    console.log(`[PARTNER-BOOKING-CONTEXT:03] DISTANCE_RESOLVED partner=${partnerId} distance_km=null reason=no_partner_loc`);
    return { km: null, display: "Distance unavailable" };
  }

  const distKm = haversineKm(
    { lat: partnerLoc.lat, lng: partnerLoc.lng },
    { lat: customerLat, lng: customerLng }
  );
  
  const rounded = Math.round(distKm * 10) / 10;
  const display = rounded < 1 ? `${Math.round(rounded * 1000)} m away` : `${rounded} km away`;

  console.log(`[PARTNER-BOOKING-CONTEXT:03] DISTANCE_RESOLVED partner=${partnerId} distance_km=${rounded}`);
  
  return {
    km: rounded,
    display
  };
}
