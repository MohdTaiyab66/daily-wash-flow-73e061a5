import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Car, Droplets, Shield, Sparkles, SprayCan, Wrench, Calendar, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type PlanInclusion = {
  id: string;
  plan_slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
};

const ICON_MAP: Record<string, typeof CheckCircle2> = {
  droplets: Droplets,
  wrench: Wrench,
  sparkles: Sparkles,
  "spray-can": SprayCan,
  shield: Shield,
  car: Car,
  calendar: Calendar,
  check: Check,
};

export function inclusionIcon(name: string | null | undefined) {
  return (name && ICON_MAP[name]) || CheckCircle2;
}

export function usePlanInclusions(planSlug: string | null | undefined) {
  return useQuery({
    queryKey: ["plan-inclusions", planSlug],
    enabled: !!planSlug,
    queryFn: async (): Promise<PlanInclusion[]> => {
      const { data, error } = await (supabase as any)
        .from("plan_inclusions")
        .select("id, plan_slug, title, description, icon, display_order, is_active")
        .eq("plan_slug", planSlug!)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanInclusion[];
    },
    staleTime: 60_000,
  });
}

export function PlanInclusionsCard({ planSlug }: { planSlug: string | null | undefined }) {
  const { data, isLoading } = usePlanInclusions(planSlug);
  if (!planSlug) return null;
  if (isLoading) return <div className="mt-4 h-20 animate-pulse rounded-2xl bg-muted" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold tracking-tight">What's included</h3>
      <ul className="mt-3 space-y-2">
        {data.map((inc) => {
          const Icon = inclusionIcon(inc.icon);
          return (
            <li key={inc.id} className="flex items-start gap-2 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-medium">{inc.title}</p>
                {inc.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{inc.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
