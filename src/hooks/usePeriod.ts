import { useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
} from "date-fns";
import { formatBusinessDate, toLocalDateString, todayLocal } from "@/lib/dateUtils";

export const PERIOD_STORAGE_KEY = "dashboardPeriod";

export const PERIOD_OPTIONS = [
  { value: "thisweek", label: "This Week" },
  { value: "lastweek", label: "Last Week" },
  { value: "thismonth", label: "This Month" },
  { value: "lastmonth", label: "Last Month" },
  { value: "thisquarter", label: "This Quarter" },
  { value: "lastquarter", label: "Last Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "alltime", label: "All Time" },
  { value: "custom", label: "Custom Range" },
] as const;

const readStoredPeriod = (): string => {
  try {
    const stored = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // ignore storage errors
  }
  return "thismonth";
};

export function formatRangeLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "All time";
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatBusinessDate(start, sameYear ? "MMM d" : "MMM d, yyyy")} – ${formatBusinessDate(end, "MMM d, yyyy")}`;
}

export function usePeriod() {
  const [period, setPeriodState] = useState<string>(readStoredPeriod);
  const [customFrom, setCustomFrom] = useState<string>(toLocalDateString(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState<string>(todayLocal());

  const setPeriod = (value: string) => {
    setPeriodState(value);
    try {
      localStorage.setItem(PERIOD_STORAGE_KEY, value);
    } catch {
      // ignore storage errors
    }
  };

  const resolveRange = (): { start: string | null; end: string | null } => {
    const today = new Date();
    switch (period) {
      case "thisweek":
        return {
          start: toLocalDateString(startOfWeek(today, { weekStartsOn: 1 })),
          end: toLocalDateString(today),
        };
      case "lastweek": {
        const ref = subWeeks(today, 1);
        return {
          start: toLocalDateString(startOfWeek(ref, { weekStartsOn: 1 })),
          end: toLocalDateString(endOfWeek(ref, { weekStartsOn: 1 })),
        };
      }
      case "thismonth":
        return { start: toLocalDateString(startOfMonth(today)), end: toLocalDateString(today) };
      case "lastmonth": {
        const ref = subMonths(today, 1);
        return { start: toLocalDateString(startOfMonth(ref)), end: toLocalDateString(endOfMonth(ref)) };
      }
      case "thisquarter":
        return { start: toLocalDateString(startOfQuarter(today)), end: toLocalDateString(today) };
      case "lastquarter": {
        const ref = subQuarters(today, 1);
        return {
          start: toLocalDateString(startOfQuarter(ref)),
          end: toLocalDateString(endOfQuarter(ref)),
        };
      }
      case "ytd":
        return { start: toLocalDateString(startOfYear(today)), end: toLocalDateString(today) };
      case "custom":
        return { start: customFrom || null, end: customTo || null };
      case "alltime":
      default:
        return { start: null, end: null };
    }
  };

  const { start, end } = resolveRange();
  const customInvalid = period === "custom" && (!customFrom || !customTo || customFrom > customTo);

  return {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    start,
    end,
    customInvalid,
    rangeLabel: formatRangeLabel(start, end),
  };
}

export type PeriodState = ReturnType<typeof usePeriod>;
