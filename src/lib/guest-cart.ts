// Tiny localStorage-backed cart so a guest can browse, pick a vehicle and
// schedule things before being asked to log in at payment time.

export type GuestVehicle = {
  catalogId?: string;
  make: string;
  model: string;
  /** raw DB tier (used for pricing) */
  category: "hatchback_compact_sedan" | "sedan_suv";
  /** finer-grained display label (e.g. SUV, Sedan, Hatchback) */
  bodyLabel?: string;
  color?: string;
  registration?: string;
  imageUrl?: string | null;
};

export type GuestCart = {
  serviceSlug?: string;
  vehicleCategory?: "hatchback" | "sedan_suv";
  vehicle?: GuestVehicle;
  addonIds?: string[];
  addonQty?: Record<string, number>;
  date?: string;
  slot?: string;
  notes?: string;
  resumePath?: string;
};

const KEY = "uw_guest_cart";

export function readGuestCart(): GuestCart {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as GuestCart;
  } catch {
    return {};
  }
}

export function writeGuestCart(patch: Partial<GuestCart>) {
  if (typeof window === "undefined") return;
  const next = { ...readGuestCart(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearGuestCart() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

/** Map raw DB tier to checkout pricing key. */
export function tierToPriceKey(t?: string | null): "hatchback" | "sedan_suv" {
  return t === "sedan_suv" ? "sedan_suv" : "hatchback";
}

/** Stash where the user should land after auth. */
export function setPendingRedirect(path: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("uw_pending_redirect", path);
}
export function consumePendingRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem("uw_pending_redirect");
  if (v) localStorage.removeItem("uw_pending_redirect");
  return v;
}
