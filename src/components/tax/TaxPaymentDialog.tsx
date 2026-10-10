import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { useCashAccounts } from "@/hooks/useCashAccounts";
import { MONEY_QUERY_KEYS, TAX_AUTHORITIES, formatTaxPeriod, useTaxTracker } from "@/hooks/useTaxTracker";
import { parseBusinessDate, todayLocal } from "@/lib/dateUtils";
import { formatMoney, isPositiveMoney, normalizeMoneyInput } from "@/lib/numericUtils";

interface TaxPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quarter to pre-select, e.g. "2026-Q4" (from get_tax_tracker.next_estimate_period). */
  defaultPeriod?: string | null;
}

/**
 * Estimated-tax quarters and their (unrolled) due dates. These are not calendar quarters:
 * Q1 is due Apr 15, Q2 Jun 15, Q3 Sep 15, Q4 Jan 15 of the next year.
 */
function estimatePeriods(today: string): { period: string; due: string }[] {
  const year = parseBusinessDate(today).getFullYear();
  const out: { period: string; due: string }[] = [];
  for (let y = year - 2; y <= year + 1; y++) {
    out.push({ period: `${y}-Q1`, due: `${y}-04-15` });
    out.push({ period: `${y}-Q2`, due: `${y}-06-15` });
    out.push({ period: `${y}-Q3`, due: `${y}-09-15` });
    out.push({ period: `${y}-Q4`, due: `${y + 1}-01-15` });
  }
  return out;
}

/** Six quarters newest first (due within the next ~4 months or earlier), and the one due nearest today. */
function quarterChoices(today: string): { list: string[]; nearest: string } {
  const todayMs = parseBusinessDate(today).getTime();
  const all = estimatePeriods(today).map((p) => ({ ...p, ms: parseBusinessDate(p.due).getTime() }));
  const nearest = all.reduce((best, p) => (Math.abs(p.ms - todayMs) < Math.abs(best.ms - todayMs) ? p : best)).period;
  const list = all
    .filter((p) => p.ms <= todayMs + 120 * 86400000)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6)
    .map((p) => p.period);
  return { list, nearest };
}

/** Records an estimated tax payment paid out of the Tax account. */
export function TaxPaymentDialog({ open, onOpenChange, defaultPeriod }: TaxPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useCashAccounts();
  const taxAccount = accounts.find((a) => a.kind === "tax");

  const { data: tracker } = useTaxTracker();
  const { quarters, nearest } = useMemo(() => {
    const { list, nearest } = quarterChoices(todayLocal());
    if (defaultPeriod && !list.includes(defaultPeriod)) list.unshift(defaultPeriod);
    return { quarters: list, nearest };
  }, [defaultPeriod]);

  const [authority, setAuthority] = useState<string>("irs");
  const [period, setPeriod] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const chosen = defaultPeriod || nearest;
    setPeriod(chosen);
    // If the federal payment for this quarter is already recorded, the next one is usually PA
    const paid = new Set((tracker?.payments || []).filter((p) => p.period === chosen).map((p) => p.authority));
    setAuthority(paid.has("irs") && !paid.has("pa") ? "pa" : "irs");
    setAmount("");
    setDate(todayLocal());
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the sheet opens
  }, [open, defaultPeriod, nearest]);

  const normalized = normalizeMoneyInput(amount);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!taxAccount) throw new Error("No Tax account found. Add one on the Accounts page.");
      if (!isPositiveMoney(normalized)) throw new Error("Enter the amount you paid");
      if (!date || date > todayLocal()) throw new Error("Date cannot be in the future");
      const { error } = await supabase.rpc("record_tax_payment", {
        p_account_id: taxAccount.id,
        p_amount: normalized as string,
        p_date: date,
        p_authority: authority,
        p_period: period,
        p_notes: notes.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: `Recorded ${formatMoney(normalized)} paid` });
      MONEY_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast({ title: "Could not record the payment", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record estimated tax payment</DialogTitle>
          <DialogDescription>
            Paid out of the Tax account. Record federal and PA as two separate payments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <FormField label="Paid to" htmlFor="tax-pay-authority" required>
            <Select value={authority} onValueChange={setAuthority}>
              <SelectTrigger id="tax-pay-authority" className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_AUTHORITIES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="For quarter" htmlFor="tax-pay-period" required>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger id="tax-pay-period" className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>
                    {formatTaxPeriod(q)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Amount paid" htmlFor="tax-pay-amount" required>
            <CurrencyInput id="tax-pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </FormField>

          <FormField label="Date paid" htmlFor="tax-pay-date" required>
            <DateInput id="tax-pay-date" value={date} onChange={(e) => setDate(e.target.value)} max={todayLocal()} />
          </FormField>

          <FormField label="Confirmation number (optional)" htmlFor="tax-pay-notes">
            <Textarea id="tax-pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          </FormField>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 min-h-[44px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={mutation.isPending || !isPositiveMoney(normalized) || !period || !taxAccount}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "SAVING..." : "RECORD PAYMENT"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
