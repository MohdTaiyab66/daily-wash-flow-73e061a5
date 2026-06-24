// Tiny localStorage-backed cart so a guest can browse and add things
// before being asked to log in at payment time.

export type GuestCart = {
  serviceSlug?: string;
  vehicleCategory?: "hatchback" | "sedan_suv";
  addonIds?: string[];
  addonQty?: Record<string, number>;
  date?: string;
  slot?: string;
  notes?: string;
  // For coming back after login:
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
