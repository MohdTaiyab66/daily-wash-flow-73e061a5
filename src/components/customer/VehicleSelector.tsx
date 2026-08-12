import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Car, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectorVehicle = {
  id: string;
  make: string;
  model: string;
  registration_number: string | null;
  is_default?: boolean | null;
};

// Unified with Home + service pages. Was sessionStorage — that caused the
// vehicle switcher on My Plan / Bookings to disagree with Home's selection.
const STORAGE_KEY = "uw_customer_vehicle";
const store = () => {
  try { return window.localStorage; } catch { return null; }
};

/**
 * Vehicle selector rendered in the top-right of My Plan / Bookings.
 *
 * Selection is persisted in sessionStorage so that switching between the
 * Subscriptions tab and Bookings tab preserves the choice within a session.
 */
export function VehicleSelector({
  vehicles,
  value,
  onChange,
  align = "right",
}: {
  vehicles: SelectorVehicle[];
  value: string | null;
  onChange: (id: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const active = vehicles.find((v) => v.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[10.5rem] items-center gap-1.5 rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-opacity active:opacity-60"
      >
        <Car className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">
          {active ? `${active.make} ${active.model}` : "Select vehicle"}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-card shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <ul className="max-h-72 overflow-y-auto py-1">
            {vehicles.map((v) => {
              const isActive = v.id === value;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(v.id);
                      try { store()?.setItem(STORAGE_KEY, v.id); } catch { /* noop */ }
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted",
                      isActive && "bg-primary/5",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {v.make} {v.model}
                      </span>
                      {v.registration_number && (
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {v.registration_number}
                        </span>
                      )}
                    </span>
                    {isActive && <span className="text-[10px] font-semibold text-primary">Selected</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border">
            <Link
              to="/c/vehicles/add"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Add vehicle
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function useSelectedVehicleId(vehicles: SelectorVehicle[] | undefined, preferredId?: string | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicles || vehicles.length === 0) {
      setSelectedId(null);
      return;
    }
    const stored = (() => {
      try { return store()?.getItem(STORAGE_KEY) ?? null; } catch { return null; }
    })();
    const hasStored = stored && vehicles.some((v) => v.id === stored);
    const hasPreferred = preferredId && vehicles.some((v) => v.id === preferredId);
    const next = hasStored
      ? stored!
      : hasPreferred
      ? preferredId!
      : (vehicles.find((v) => v.is_default)?.id ?? vehicles[0].id);
    setSelectedId((cur) => (cur && vehicles.some((v) => v.id === cur) ? cur : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles?.map((v) => v.id).join(","), preferredId]);

  const set = (id: string) => {
    setSelectedId(id);
    try { store()?.setItem(STORAGE_KEY, id); } catch { /* noop */ }
  };
  return [selectedId, set] as const;
}
