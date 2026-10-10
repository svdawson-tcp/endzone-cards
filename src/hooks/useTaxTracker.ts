import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

/** One Monday–Sunday week as returned by get_tax_tracker (all money computed in the database). */
export interface TaxWeek {
  week_start: string;
  gross: number;
  sale_count: number;
  owed: number;
  deposited: number;
  cum_owed: number;
  cum_deposited: number;
  late_entries: boolean;
  status: "accruing" | "nothing_owed" | "covered" | "partial" | "open";
}

export interface TaxPayment {
  id: string;
  date: string;
  amount: number;
  authority: "irs" | "pa" | "local";
  period: string;
  notes: string | null;
}

export interface TaxTracker {
  today: string;
  tax_rate: number;
  tracker_start: string;
  current_week: string;
  gross_sales: number;
  owed_due: number;
  accruing: number;
  deposited: number;
  /** deposited − owed for completed weeks. Negative = behind. */
  position: number;
  suggested_transfer: number;
  tax_account_balance: number;
  interest_total: number;
  paid_total: number;
  payments: TaxPayment[];
  next_estimate_due: string | null;
  next_estimate_period: string | null;
  weeks: TaxWeek[];
}

export const TAX_AUTHORITIES = [
  { value: "irs", label: "IRS (federal)" },
  { value: "pa", label: "Pennsylvania" },
  { value: "local", label: "Local (earned income tax)" },
] as const;

export const taxAuthorityLabel = (value: string) =>
  TAX_AUTHORITIES.find((a) => a.value === value)?.label || value;

/** "2026-Q4" → "Q4 2026" */
export const formatTaxPeriod = (period: string | null | undefined) =>
  period ? `${period.slice(5)} ${period.slice(0, 4)}` : "";

/** Weekly tax tracker for the effective user (the mentee in mentor view). */
export function useTaxTracker() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();

  return useQuery({
    queryKey: ["taxTracker", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_tax_tracker", { p_user_id: userId });
      if (error) throw error;
      return data as unknown as TaxTracker;
    },
  });
}

/** Query keys every money write should refresh. */
export const MONEY_QUERY_KEYS = [
  ["taxTracker"],
  ["reminders"],
  ["accountBalances"],
  ["accountStatement"],
  ["dashboardMetrics"],
  ["all-transactions"],
  ["cash_accounts"],
] as const;
