import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type PlanInclusion = {
  id: string;
  plan_slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: boolean;
};

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
  const [open, setOpen] = useState(false);
  
  if (!planSlug) return null;
  if (isLoading) return <div className="mt-4 h-14 animate-pulse rounded-[18px] bg-neutral-50" />;
  if (!data || data.length === 0) return null;

  // Process data to ensure "25 Days" for a 25-day service plan
  const processedData = data.map(item => {
    if (item.title.toLowerCase().includes("daily exterior") || item.title.toLowerCase().includes("service days")) {
      return { ...item, title: "25 Days Daily Exterior Chemical Cleaning" };
    }
    return item;
  });

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#EEEEEE] bg-white shadow-sm transition-all duration-300">
      <div className="px-5 py-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-[#8A8A8A] mb-4">WHAT'S INCLUDED</h3>
        
        <div className="space-y-3">
          {(open ? processedData : processedData.slice(0, 3)).map((item) => (
            <div key={item.id} className="flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                <Check className="h-2.5 w-2.5" />
              </div>
              <span className="text-[14px] font-bold text-[#1A1A1A] leading-tight">{item.title}</span>
            </div>
          ))}
        </div>

        {processedData.length > 3 && (
          <button
            onClick={() => setOpen(!open)}
            className="mt-5 flex w-full items-center justify-center gap-2 border-t border-[#F5F5F5] pt-4 text-[13px] font-bold text-[#FF6B00] active:opacity-60 transition-all"
          >
            {open ? (
              <>Show less ↑</>
            ) : (
              <>+{processedData.length - 3} more benefits · View all →</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
