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
