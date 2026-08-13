
export const resolveDailyShinePrice = (category: string | null | undefined, service: { price_hatchback: number; price_sedan_suv: number } | null | undefined) => {
  // Canonical mapping:
  // Hatchback -> 999
  // Compact Sedan -> 999
  // SUV/MUV -> 1199

  const cat = category?.toLowerCase() || '';
  
  // If we have the service record, use it as the source of truth for the values
  const hatchbackPrice = service?.price_hatchback ?? 999;
  const suvPrice = service?.price_sedan_suv ?? 1199;

  // Determine if it's SUV/MUV based on existing category strings
  // In our app, 'sedan_suv' is currently the key for the higher tier.
  // We need to ensure that 'compact_sedan' (if it exists) falls into the hatchback tier if not already.
  
  const isHighTier = cat.includes('suv') || (cat.includes('sedan') && !cat.includes('compact'));
  
  const resolvedPrice = isHighTier ? suvPrice : hatchbackPrice;

  console.log("[DAILY-SHINE-PRICE-RESOLVER]", {
    category: category,
    isHighTier,
    resolvedPrice,
    source: service ? 'SERVICE_CATALOG' : 'FALLBACK'
  });

  return resolvedPrice;
};
