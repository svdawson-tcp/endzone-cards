import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { useCashAccounts } from "@/hooks/useCashAccounts";
import { MONEY_QUERY_KEYS } from "@/hooks/useTaxTracker";
import { todayLocal } from "@/lib/dateUtils";
import { formatMoney, isPositiveMoney, normalizeMoneyInput } from "@/lib/numericUtils";

interface TaxTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled amount, from get_tax_tracker.suggested_transfer. */
  suggestedAmount: number;
}

/**
 * "I sent it": records the weekly move into the Tax account as a transfer.
 * Everything is pre-filled so the usual case is a single tap on Confirm.
 */
export function TaxTransferDialog({ open, onOpenChange, suggestedAmount }: TaxTransferDialogProps) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useCashAccounts();
  const taxAccount = accounts.find((a) => a.kind === "tax");
  const sourceAccounts = accounts.filter((a) => a.kind !== "tax");

  const [fromAccount, setFromAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());

  // Reset to the suggested values each time the sheet opens
  useEffect(() => {
    if (!open) return;
    setAmount(suggestedAmount > 0 ? Number(suggestedAmount).toFixed(2) : "");
    setDate(todayLocal());
    const operating = accounts.find((a) => a.kind === "operating") || accounts.find((a) => a.is_default);
    setFromAccount(operating?.id || "");
  }, [open, suggestedAmount, accounts]);

  const normalized = normalizeMoneyInput(amount);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!taxAccount) throw new Error("No Tax account found. Add one on the Accounts page.");
      if (!fromAccount) throw new Error("Choose which account the money came from");
      if (!isPositiveMoney(normalized)) throw new Error("Enter an amount greater than zero");
      if (!date || date > todayLocal()) throw new Error("Date cannot be in the future");
      const { error } = await supabase.rpc("record_account_transfer", {
        p_from_account: fromAccount,
        p_to_account: taxAccount.id,
        p_amount: normalized as string,
        p_date: date,
        p_notes: "Weekly tax set-aside",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: `Recorded ${formatMoney(normalized)} to Tax` });
      MONEY_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast({ title: "Could not record the transfer", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record tax transfer</DialogTitle>
          <DialogDescription>
            Send this from your bank app first, then confirm it here. It moves money between your own accounts, so it
            doesn't count as an expense.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <FormField label="Amount sent" htmlFor="tax-transfer-amount" required>
            <CurrencyInput
              id="tax-transfer-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus={false}
            />
          </FormField>

          <FormField label="From" htmlFor="tax-transfer-from" required helperText="To: Tax">
            <Select value={fromAccount} onValueChange={setFromAccount}>
              <SelectTrigger id="tax-transfer-from" className="min-h-[44px]">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Date sent" htmlFor="tax-transfer-date" required>
            <DateInput id="tax-transfer-date" value={date} onChange={(e) => setDate(e.target.value)} max={todayLocal()} />
          </FormField>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 min-h-[44px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={mutation.isPending || !isPositiveMoney(normalized) || !fromAccount || !taxAccount}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "SAVING..." : "CONFIRM"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
