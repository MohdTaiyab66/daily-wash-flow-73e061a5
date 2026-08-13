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
  const cat = category?.toLowerCase() || '';
  
  // Use service catalog prices if available, otherwise fall back to strict defaults
  const hatchbackPrice = service?.price_hatchback ?? 999;
  const suvPrice = service?.price_sedan_suv ?? 1199;

  /**
   * VEHICLE CLASSIFICATION MAPPING:
   * 
   * 'hatchback_compact_sedan' (DB Key) -> Hatchback Pricing (₹999)
   * 'sedan_suv' (DB Key) -> SUV Pricing (₹1199)
   */
  let resolvedPrice = 0;
  let resolvedCategory = 'unknown';

  if (cat === 'hatchback_compact_sedan') {
    resolvedPrice = hatchbackPrice;
    resolvedCategory = 'hatchback_compact_sedan';
  } else if (cat === 'sedan_suv') {
    resolvedPrice = suvPrice;
    resolvedCategory = 'sedan_suv';
  }

  // FORENSIC LOGGING
  console.log("[DAILY-SHINE-PRICE-FORENSIC]", {
    stage: "RESOLVER",
    vehicleCategory: category,
    resolvedCategory,
    resolvedPrice,
    databasePrice: service?.price_hatchback,
    databaseAmount: service?.price_sedan_suv
  });

  return resolvedPrice;
};
