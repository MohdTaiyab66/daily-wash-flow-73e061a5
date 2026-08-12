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
    <div className="overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-sm transition-all duration-300">
      <div className="px-6 py-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-black/20 mb-5">Plan Inclusions</h3>
        
        <div className="space-y-4">
          {(open ? processedData : processedData.slice(0, 3)).map((item) => (
            <div key={item.id} className="flex items-start gap-3.5 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#FF6B00] text-white">
                <Check className="h-3 w-3" />
              </div>
              <span className="text-[14px] font-black text-[#1A1A1A] leading-tight">{item.title}</span>
            </div>
          ))}
        </div>

        {processedData.length > 3 && (
          <button
            onClick={() => setOpen(!open)}
            className="mt-6 flex w-full items-center justify-center gap-2 border-t border-black/5 pt-5 text-[12px] font-black uppercase tracking-[0.05em] text-[#FF6B00] active:scale-95 transition-all"
          >
            {open ? (
              <>Show less</>
            ) : (
              <>+{processedData.length - 3} More Benefits · View Details</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
