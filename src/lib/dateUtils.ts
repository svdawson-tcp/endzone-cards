import { format } from "date-fns";

/**
 * Business-date helpers (ISS-003).
 *
 * Business dates (purchase_date, show_date, expense_date, closure_date,
 * transaction_date) are calendar days, not moments in time. Passing a
 * "YYYY-MM-DD" string to `new Date()` parses it as midnight UTC, which renders
 * as the PREVIOUS day anywhere west of UTC (e.g., 9/19 -> 9/18 in US Eastern).
 *
 * Rule: never call `new Date(businessDate)` directly. Use these helpers.
 * Real timestamps (created_at, updated_at, corrected_at) still use `new Date()`.
 */

/** Extract the calendar day ("YYYY-MM-DD") from a date or timestamptz string. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

/** Parse a business date as a LOCAL calendar day (no timezone shift). */
export function parseBusinessDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a business date for display. Returns "" for empty/invalid input. */
export function formatBusinessDate(value: string | null | undefined, pattern: string): string {
  if (!value) return "";
  const date = parseBusinessDate(value);
  return isNaN(date.getTime()) ? "" : format(date, pattern);
}

/** Today's LOCAL calendar day as "YYYY-MM-DD" (not UTC, which rolls over at 8 PM Eastern). */
export function todayLocal(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Any Date as a LOCAL "YYYY-MM-DD" string. Use instead of toISOString().split("T")[0]. */
export function toLocalDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}