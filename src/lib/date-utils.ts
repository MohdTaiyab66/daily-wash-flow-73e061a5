import { format, toZonedTime } from "date-fns-tz";

const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Returns the current date in IST as an ISO string (YYYY-MM-DD).
 */
export function getTodayIST(): string {
  const now = new Date();
  const zonedDate = toZonedTime(now, IST_TIMEZONE);
  return format(zonedDate, "yyyy-MM-dd", { timeZone: IST_TIMEZONE });
}

/**
 * Formats a date/timestamp for business display in IST.
 * Input: ISO string or Date object (UTC)
 * Output: "20 Aug · 2:16 AM"
 */
export function formatBusinessDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, IST_TIMEZONE);
  return format(zonedDate, "d MMM · h:mm a", { timeZone: IST_TIMEZONE });
}

/**
 * Returns a standard business date string (YYYY-MM-DD) for any UTC timestamp in IST.
 */
export function toBusinessDateString(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, IST_TIMEZONE);
  return format(zonedDate, "yyyy-MM-dd", { timeZone: IST_TIMEZONE });
}
