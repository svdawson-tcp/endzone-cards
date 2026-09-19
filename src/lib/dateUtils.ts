import {
  format,
  addDays,
  subDays,
  subWeeks,
  subMonths,
  subQuarters,
  subYears,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  differenceInCalendarDays,
  min as minDate,
} from "date-fns";

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

export type DateRange = { start: string; end: string };

/**
 * The comparable range immediately before the selected one.
 * Returns null when no comparison makes sense (All Time / missing dates).
 */
export function previousPeriodRange(
  preset: string,
  start: string | null,
  end: string | null
): DateRange | null {
  if (!start || !end) return null;
  const s = parseBusinessDate(start);
  const e = parseBusinessDate(end);

  switch (preset) {
    case "thisweek":
      return { start: toLocalDateString(subWeeks(s, 1)), end: toLocalDateString(subWeeks(e, 1)) };
    case "lastweek":
      return { start: toLocalDateString(subWeeks(s, 1)), end: toLocalDateString(subWeeks(e, 1)) };
    case "thismonth":
      return {
        start: toLocalDateString(startOfMonth(subMonths(s, 1))),
        end: toLocalDateString(subMonths(e, 1)),
      };
    case "lastmonth": {
      const ref = subMonths(s, 1);
      return { start: toLocalDateString(startOfMonth(ref)), end: toLocalDateString(endOfMonth(ref)) };
    }
    case "thisquarter": {
      const prevStart = startOfQuarter(subQuarters(s, 1));
      const offset = differenceInCalendarDays(e, s);
      const prevEnd = minDate([addDays(prevStart, offset), endOfQuarter(prevStart)]);
      return { start: toLocalDateString(prevStart), end: toLocalDateString(prevEnd) };
    }
    case "lastquarter": {
      const ref = subQuarters(s, 1);
      return {
        start: toLocalDateString(startOfQuarter(ref)),
        end: toLocalDateString(endOfQuarter(ref)),
      };
    }
    case "ytd":
      return {
        start: toLocalDateString(startOfYear(subYears(s, 1))),
        end: toLocalDateString(subYears(e, 1)),
      };
    case "custom": {
      const days = differenceInCalendarDays(e, s) + 1;
      const prevEnd = subDays(s, 1);
      return {
        start: toLocalDateString(subDays(prevEnd, days - 1)),
        end: toLocalDateString(prevEnd),
      };
    }
    case "alltime":
    default:
      return null;
  }
}

/** The same range one year earlier (Feb 29 -> Feb 28). */
export function sameRangeLastYear(start: string | null, end: string | null): DateRange | null {
  if (!start || !end) return null;
  return {
    start: toLocalDateString(subYears(parseBusinessDate(start), 1)),
    end: toLocalDateString(subYears(parseBusinessDate(end), 1)),
  };
}