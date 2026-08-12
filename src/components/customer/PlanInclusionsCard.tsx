import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Car, Droplets, Shield, Sparkles, SprayCan, Wrench, Calendar, Check, ChevronDown } from "lucide-react";
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

/**
 * Collapsible "What's included" list. Collapsed by default so the plan screen
 * stays short — the data and query are unchanged.
 */
export function PlanInclusionsCard({ planSlug }: { planSlug: string | null | undefined }) {
  const { data, isLoading } = usePlanInclusions(planSlug);
  const [open, setOpen] = useState(false);
  if (!planSlug) return null;
  if (isLoading) return <div className="mt-4 h-14 animate-pulse rounded-2xl bg-muted" />;
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-[22px] border border-[#EEEEEE] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="uw-pressable flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-[#1A1A1A]">What's included</span>
          {!open && (
            <span className="mt-0.5 block truncate text-[12px] font-medium text-[#8A8A8A]">
              {data.slice(0, 3).map((i) => i.title).join(" · ")}
              {data.length > 3 ? ` +${data.length - 3} more` : ""}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8A8A8A] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="animate-fade-in space-y-3 border-t border-[#F5F5F5] px-4 py-4">
          {data.map((inc) => {
            const Icon = inclusionIcon(inc.icon);
            return (
              <li key={inc.id} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#1A1A1A] leading-snug">{inc.title}</p>
                  {inc.description && (
                    <p className="mt-0.5 text-[12.5px] text-[#8A8A8A] font-medium">{inc.description}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
