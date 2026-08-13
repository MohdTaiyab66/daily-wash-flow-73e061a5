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
   * 'hatchback_compact_sedan' (DB Key) -> Hatchback Pricing
   * 'sedan_suv' (DB Key) -> SUV Pricing
   * 
   * We also check for keywords to be safe if a raw string is passed.
   */
  const isHighTier = cat === 'sedan_suv' || (cat.includes('suv') && !cat.includes('compact')) || (cat.includes('sedan') && !cat.includes('compact'));
  
  const resolvedPrice = isHighTier ? suvPrice : hatchbackPrice;

  console.log("[PRICE-TRACE-04] [DAILY-SHINE-PRICE-RESOLVER]", {
    inputCategory: category,
    normalizedCategory: cat,
    isHighTier,
    resolvedPrice,
    source: service ? 'SERVICE_CATALOG' : 'STRICT_FALLBACK'
  });

  return resolvedPrice;
};
