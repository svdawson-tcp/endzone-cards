/**
 * Safely parse a value to a number, returning null for invalid inputs.
 * Use for optional financial fields (cost_basis, asking_price).
 */
export function parseAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * TD-007: validate a typed dollar amount and return it as a string for PostgreSQL numeric.
 * Accepts "12", "12.5", "12.50", "$1,234.56"; returns "1234.56"-style text or null if invalid.
 * Never converts to a JS float, so no rounding drift on the way to the database.
 */
export function normalizeMoneyInput(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return `${String(BigInt(whole))}.${frac.padEnd(2, "0")}`;
}

/** True when a normalized money string is greater than zero. */
export function isPositiveMoney(value: string | null): boolean {
  return value !== null && /[1-9]/.test(value);
}

/**
 * Display a database money value ("1234.5" or 1234.5) as "$1,234.50".
 * Display only — never use the result for arithmetic or writes.
 */
export function formatMoney(value: string | number | null | undefined, opts: { sign?: boolean } = {}): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(safe).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (safe < 0) return `−$${abs}`;
  return opts.sign && safe > 0 ? `+$${abs}` : `$${abs}`;
}

/**
 * Safely parse a value to a number, throwing for invalid inputs.
 * Use for required financial fields (revenue, amount, sale_price).
 */
export function parseRequiredAmount(value: string | number): number {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return num;
}
