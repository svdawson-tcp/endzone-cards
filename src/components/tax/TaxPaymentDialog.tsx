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
import { MONEY_QUERY_KEYS, TAX_AUTHORITIES, formatTaxPeriod } from "@/hooks/useTaxTracker";
import { parseBusinessDate, todayLocal } from "@/lib/dateUtils";
import { formatMoney, isPositiveMoney, normalizeMoneyInput } from "@/lib/numericUtils";

interface TaxPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quarter to pre-select, e.g. "2026-Q4" (from get_tax_tracker.next_estimate_period). */
  defaultPeriod?: string | null;
}

/** The last six estimated-tax quarters up to the current one, newest first. */
function recentQuarters(today: string): string[] {
  const d = parseBusinessDate(today);
  let year = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    out.push(`${year}-Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      year -= 1;
    }
  }
  return out;
}

/** Records an estimated tax payment paid out of the Tax account. */
export function TaxPaymentDialog({ open, onOpenChange, defaultPeriod }: TaxPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useCashAccounts();
  const taxAccount = accounts.find((a) => a.kind === "tax");

  const quarters = useMemo(() => {
    const list = recentQuarters(todayLocal());
    if (defaultPeriod && !list.includes(defaultPeriod)) list.unshift(defaultPeriod);
    return list;
  }, [defaultPeriod]);

  const [authority, setAuthority] = useState<string>("irs");
  const [period, setPeriod] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setAuthority("irs");
    setPeriod(defaultPeriod || quarters[1] || quarters[0]);
    setAmount("");
    setDate(todayLocal());
    setNotes("");
  }, [open, defaultPeriod, quarters]);

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
