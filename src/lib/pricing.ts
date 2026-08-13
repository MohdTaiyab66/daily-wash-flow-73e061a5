/**
 * Canonical Pricing Resolver for Daily Shine Subscriptions
 * 
 * Rules:
 * 1. Hatchback, Compact Sedan, and small SUVs (Nexon, Brezza, Punch, etc.) -> ₹999
 * 2. SUV/MUV and large Sedans -> ₹1199
 */
export const resolveDailyShinePrice = (
  category: string | null | undefined, 
  service: { price_hatchback: number; price_sedan_suv: number } | null | undefined
) => {
  const cat = category?.toLowerCase() || 'hatchback_compact_sedan'; // DEFAULT TO HATCHBACK
  
  // Use service catalog prices if available, otherwise fall back to strict defaults
  const hatchbackPrice = service?.price_hatchback ?? 999;
  const suvPrice = service?.price_sedan_suv ?? 1199;

  /**
   * VEHICLE CLASSIFICATION MAPPING:
   * 
   * 'hatchback_compact_sedan' (DB Key) -> Hatchback Pricing
   * 'sedan_suv' (DB Key) -> SUV Pricing
   */
  const isHighTier = cat === 'sedan_suv';
  
  const resolvedPrice = isHighTier ? suvPrice : hatchbackPrice;

  return resolvedPrice;
};
