export const EXPENSE_CATEGORIES = [
  "Shipping & Postage",
  "Platform Fees",
  "Table / Booth Fees",
  "Hotel & Lodging",
  "Travel (Gas, Tolls, Parking)",
  "Meals",
  "Grading",
  "Supplies",
  "Software & Subscriptions",
  "Other",
] as const; // must match expenses_category_check exactly

export const SALES_CHANNELS = [
  { value: "ebay", label: "eBay" },
  { value: "facebook", label: "Facebook" },
  { value: "whatnot", label: "Whatnot" },
  { value: "card_show", label: "Card Show" },
  { value: "in_person", label: "In Person" },
  { value: "other", label: "Other" },
] as const;

export const CASH_TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal (unclassified)",
  adjustment: "Adjustment",
  auto_sale: "Sale",
  auto_purchase: "Lot Purchase",
  auto_expense: "Expense",
  owner_contribution: "Owner Contribution",
  owner_draw: "Owner Draw",
  reimbursement: "Reimbursement",
  transfer: "Transfer",
};

export const CASH_ACCOUNT_KINDS = [
  { value: "operating", label: "Operating" },
  { value: "tax", label: "Tax" },
  { value: "reserve", label: "Reserve" },
  { value: "travel", label: "Travel & Shows" },
  { value: "other", label: "Other" },
] as const;

export const SALES_CHANNEL_STORAGE_KEY = "lastSalesChannel";

export const readLastSalesChannel = (): string => {
  try {
    return localStorage.getItem(SALES_CHANNEL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

export const writeLastSalesChannel = (value: string) => {
  try {
    localStorage.setItem(SALES_CHANNEL_STORAGE_KEY, value);
  } catch {
    // ignore storage errors
  }
};
