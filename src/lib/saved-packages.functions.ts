import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 5 — Package Builder & Saved Packages
 *
 * Customers save a base-plan + monthly-add-ons combo under a friendly name
 * (e.g. "Family Car", "Office Car") and later apply it to another vehicle.
 */

export type PackageAddon = {
  addon_type: "extra_exterior" | "extra_interior" | "extra_both";
  quantity: number;
  monthly_price: number;
};

export type SavedPackage = {
  id: string;
  name: string;
  base_plan_slug: string;
  base_plan_price: number;
  addons: PackageAddon[];
  total_monthly: number;
  created_at: string;
};

export const listSavedPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await (supabase as any)
      .from("customer_saved_packages")
      .select("id, name, base_plan_slug, base_plan_price, addons, total_monthly, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as SavedPackage[];
  });

export const saveCustomerPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      base_plan_slug: string;
      base_plan_price: number;
      addons: PackageAddon[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = data.name.trim();
    if (!name) throw new Error("Please enter a package name");
    if (name.length > 60) throw new Error("Name is too long");

    const addonsTotal = data.addons.reduce(
      (sum, a) => sum + Number(a.monthly_price || 0) * Math.max(1, a.quantity || 0),
      0,
    );
    const total_monthly = Number(data.base_plan_price || 0) + addonsTotal;

    const { data: row, error } = await (supabase as any)
      .from("customer_saved_packages")
      .insert({
        user_id: userId,
        name,
        base_plan_slug: data.base_plan_slug,
        base_plan_price: data.base_plan_price,
        addons: data.addons,
        total_monthly,
      })
      .select("id, name, base_plan_slug, base_plan_price, addons, total_monthly, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as SavedPackage;
  });

export const deleteSavedPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("customer_saved_packages")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
