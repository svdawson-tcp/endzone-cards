import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { MONEY_QUERY_KEYS } from "@/hooks/useTaxTracker";
import { todayLocal } from "@/lib/dateUtils";
import { formatMoney, normalizeMoneyInput } from "@/lib/numericUtils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ReconcileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  accountKind: string;
}

/**
 * Compare an account with the bank. The app balance comes from the server
 * (get_account_statement closing as of the date); the difference preview is display only —
 * record_reconciliation recomputes everything when saved.
 */
export function ReconcileDialog({ open, onOpenChange, accountId, accountName, accountKind }: ReconcileDialogProps) {
  const queryClient = useQueryClient();
  const isOperating = accountKind === "operating";
  const [asOf, setAsOf] = useState(todayLocal());
  const [bankBalance, setBankBalance] = useState("");
  const [undeposited, setUndeposited] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setAsOf(todayLocal());
    setBankBalance("");
    setUndeposited("");
    setNote("");
  }, [open]);

  const { data: appBalance, isLoading } = useQuery({
    queryKey: ["accountStatement", accountId, "balanceAsOf", asOf],
    enabled: open && !!accountId && !!asOf,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_account_statement", {
        p_account_id: accountId,
        p_to: asOf,
        p_limit: 1,
      });
      if (error) throw error;
      return String((data as unknown as { closing: number | string }).closing);
    },
  });

  const bank = normalizeMoneyInput(bankBalance);
  const outside = isOperating ? normalizeMoneyInput(undeposited || "0") : "0.00";
  // Display-only preview, rounded to cents
  const difference =
    bank !== null && outside !== null && appBalance !== undefined
      ? Math.round((Number(appBalance) - Number(bank) - Number(outside)) * 100) / 100
      : null;

  const mutation = useMutation({
    mutationFn: async (postAdjustment: boolean) => {
      if (bank === null) throw new Error("Enter the bank balance");
      const { data, error } = await supabase.rpc("record_reconciliation", {
        p_account_id: accountId,
        p_as_of: asOf,
        p_bank_balance: bank,
        p_undeposited: outside ?? "0.00",
        p_note: note.trim() || undefined,
        p_post_adjustment: postAdjustment,
      });
      if (error) throw error;
      return data as unknown as { difference: number; matched: boolean };
    },
    onSuccess: (data) => {
      toast({
        title: Number(data.difference) === 0 ? `${accountName} matches the bank` : data.matched ? "Adjustment posted" : "Check saved with a difference",
      });
      MONEY_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Could not save the check", description: error.message, variant: "destructive" }),
  });

  const noteOk = note.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check {accountName} against the bank</DialogTitle>
          <DialogDescription>Use the balance your banking app shows for this date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <FormField label="Balance as of" htmlFor="rec-date" required>
            <DateInput id="rec-date" value={asOf} max={todayLocal()} onChange={(e) => setAsOf(e.target.value)} />
          </FormField>
          <FormField label="Bank balance" htmlFor="rec-bank" required>
            <CurrencyInput id="rec-bank" value={bankBalance} onChange={(e) => setBankBalance(e.target.value)} placeholder="0.00" />
          </FormField>
          {isOperating && (
            <FormField
              label="Not yet in the bank"
              htmlFor="rec-outside"
              helperText="Show cash plus PayPal, Venmo, eBay or Whatnot money not yet paid out"
            >
              <CurrencyInput id="rec-outside" value={undeposited} onChange={(e) => setUndeposited(e.target.value)} placeholder="0.00" />
            </FormField>
          )}

          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>EndZone shows</span>
              <span>{isLoading ? "…" : formatMoney(appBalance)}</span>
            </div>
            {difference !== null && (
              <div className={`flex items-center justify-between mt-2 font-semibold ${difference === 0 ? "metric-positive" : "text-amber-400"}`}>
                <span className="flex items-center gap-1">
                  {difference === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {difference === 0 ? "Matches" : difference > 0 ? "EndZone is higher by" : "EndZone is lower by"}
                </span>
                {difference !== 0 && <span>{formatMoney(Math.abs(difference))}</span>}
              </div>
            )}
            {difference !== null && difference !== 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {accountKind === "tax"
                  ? "Usual causes: an estimated tax payment or interest not entered yet. Record those on the Tax page instead of adjusting, so the tax tracker stays right."
                  : "Usual causes: a bank fee or interest not entered, a debit-card expense not recorded, or a transfer sent in the last few days that hasn't landed yet."}
              </p>
            )}
          </div>

          {difference !== null && difference !== 0 && (
            <FormField label="What explains it?" htmlFor="rec-note" helperText="Required to post an adjustment (10+ characters)">
              <Textarea id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
            </FormField>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {difference === 0 || difference === null ? (
              <Button
                className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={mutation.isPending || difference === null}
                onClick={() => mutation.mutate(false)}
              >
                SAVE CHECK
              </Button>
            ) : (
              <>
                <Button
                  className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={mutation.isPending || !noteOk}
                  onClick={() => mutation.mutate(true)}
                >
                  POST {formatMoney(-difference, { sign: true })} ADJUSTMENT
                </Button>
                <Button variant="outline" className="min-h-[44px]" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
                  Save check without adjusting
                </Button>
              </>
            )}
            <Button variant="ghost" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
              Cancel — I'll fix the entries first
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
