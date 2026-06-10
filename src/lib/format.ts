// Time formatting helpers — always show AM/PM for partner-facing UI.

export function formatTime12(t?: string | null): string {
  if (!t) return "";
  const s = t.trim();
  // Accept "HH:MM" or "HH:MM:SS"
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return s;
  let h = parseInt(m[1], 10);
  const mins = m[2];
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mins} ${period}`;
}

/** Accepts "06:00 - 09:00" or "06:00" and returns "6:00 AM - 9:00 AM" / "6:00 AM" */
export function formatTimeSlot12(slot?: string | null): string {
  if (!slot) return "";
  const parts = slot.split(/\s*-\s*/);
  if (parts.length === 2) return `${formatTime12(parts[0])} - ${formatTime12(parts[1])}`;
  return formatTime12(slot);
}

/** "Required before" prefix uses the latest time of the slot */
export function requiredBefore(slot?: string | null): string {
  if (!slot) return "";
  const parts = slot.split(/\s*-\s*/);
  return formatTime12(parts[parts.length - 1]);
}
