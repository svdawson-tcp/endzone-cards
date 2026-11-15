import { useSearchParams } from "react-router-dom";

/** One item on the To Do list, as returned by get_todo (0031). */
export type TodoItem = {
  key: string;
  period: string;
  kind:
    | "setup" | "tax_transfer" | "estimated_tax" | "reconcile" | "info" | "checkup" | "trip" | "task"
    | "sell_lead" | "offer" | "order" | "show_fee" | "show_prep" | "show_close" | "old_shows" | "headliner" | "wanted";
  tier: "now" | "week" | "later";
  title: string;
  body: string;
  due: string | null;
  amount?: number;
  overdue?: boolean;
  account_id?: string;
  first?: boolean;
  trip?: TripPrefill;
  task_id?: string;
  urgent?: boolean;
  created_by?: string;
  added_by_mentor?: boolean;
  /** a combined bank-check card: the reminder keys it stands for */
  keys?: string[];
  /** page to open for the item (0032 business items) */
  link?: string;
  show_date?: string;
  show_id?: string;
  show_ids?: string[];
  website_show_id?: string;
  needs_show?: boolean;
  hours_waiting?: number;
};

export type TripPurpose = "show" | "seller_meetup" | "buying" | "post_office" | "supplies" | "other";

export type TripPrefill = {
  trip_date?: string;
  destination?: string;
  purpose?: TripPurpose;
  show_id?: string | null;
  lot_id?: string | null;
  sell_lead_id?: string | null;
  website_show_id?: string | null;
  /** reminders_state key of the prompt this trip answers (so "No drive" and "Log it" both clear it) */
  prompt_key?: string;
};

export const TRIP_PURPOSES: { value: TripPurpose; label: string }[] = [
  { value: "show", label: "Card show" },
  { value: "seller_meetup", label: "Meet a seller" },
  { value: "buying", label: "Buying trip" },
  { value: "post_office", label: "Post office" },
  { value: "supplies", label: "Supplies" },
  { value: "other", label: "Other" },
];

export const tripPurposeLabel = (p: string) => TRIP_PURPOSES.find((x) => x.value === p)?.label ?? p;

/** Only same-app paths are allowed as a return target (no other sites, no protocol-relative URLs). */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\/(?!\/)[A-Za-z0-9/_\-?=&%.:]*$/.test(value) ? value : null;
}

/** ?returnTo=/checkup/2026-11 → where a form goes after saving, or the form's usual page. */
export function useReturnTo(fallback: string): string {
  const [params] = useSearchParams();
  return safeReturnTo(params.get("returnTo")) ?? fallback;
}

/** "2026-11" → "November 2026" */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
