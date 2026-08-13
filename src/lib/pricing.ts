/**
 * Canonical Pricing Resolver for Daily Shine Subscriptions
 */
// import { Service } from "@/types/service";

export function resolveDailyShinePrice(category: string | undefined, service?: any) {
  const isHighTier = category === 'sedan_suv';
  const resolvedPrice = isHighTier ? 1199 : 999;
  
  
  return resolvedPrice;
}
