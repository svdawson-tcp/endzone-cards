import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { PageContainer } from "@/components/layout/AppLayout";
import { todayLocal } from "@/lib/dateUtils";
import { parseRequiredAmount } from "@/lib/numericUtils";
import { useCashAccounts } from "@/hooks/useCashAccounts";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { ArrowLeft } from "lucide-react";

export default function CashTransfer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isViewingAsMentor } = useMentorAccess();
  const { data: accounts = [] } = useCashAccounts();

  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!fromAccount && accounts.length > 0) {
      setFromAccount((accounts.find((a) => a.is_default) || accounts[0]).id);
    }
  }, [accounts, fromAccount]);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("record_account_transfer", {
        p_from_account: fromAccount,
        p_to_account: toAccount,
        p_amount: parseRequiredAmount(amount),
        p_date: date,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Transfer recorded" });
      queryClient.invalidateQueries({ queryKey: ["accountBalances"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      navigate("/accounts");
    },
    onError: (error: Error) =>
      toast({ title: "Transfer failed", description: error.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fromAccount || !toAccount) {
      toast({ title: "Choose both accounts", variant: "destructive" });
      return;
    }
    if (fromAccount === toAccount) {
      toast({ title: "Choose two different accounts", variant: "destructive" });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Enter an amount greater than zero", variant: "destructive" });
      return;
    }
    if (!date || date > todayLocal()) {
      toast({ title: "Transfer date cannot be in the future", variant: "destructive" });
      return;
    }

    transferMutation.mutate();
  };

  if (isViewingAsMentor) {
    return (
      <PageContainer maxWidth="2xl">
        <h1 className="page-title mb-2">TRANSFER BETWEEN ACCOUNTS</h1>
        <div className="bg-card shadow-card-shadow rounded-lg p-6">
          <p className="text-muted-foreground">
            You are viewing another account in read-only mentor view. Transfers cannot be recorded here.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <Button variant="ghost" onClick={() => navigate("/accounts")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Accounts
      </Button>

      <div className="mb-6">
        <h1 className="page-title mb-2">TRANSFER BETWEEN ACCOUNTS</h1>
        <p className="text-muted-foreground">Moving money between accounts does not change total cash</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-6">
        <FormField label="From Account" htmlFor="from-account" required>
          <Select value={fromAccount} onValueChange={setFromAccount}>
            <SelectTrigger id="from-account" className="min-h-[44px]">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="To Account" htmlFor="to-account" required>
          <Select value={toAccount} onValueChange={setToAccount}>
            <SelectTrigger id="to-account" className="min-h-[44px]">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((account) => account.id !== fromAccount)
                .map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Amount" htmlFor="transfer-amount" required>
          <CurrencyInput
            id="transfer-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </FormField>

        <FormField label="Date" htmlFor="transfer-date" required>
          <DateInput
            id="transfer-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayLocal()}
          />
        </FormField>

        <FormField label="Notes (Optional)" htmlFor="transfer-notes">
          <Textarea
            id="transfer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What is this transfer for?"
          />
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-h-[44px]"
            onClick={() => navigate("/accounts")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={transferMutation.isPending}
          >
            {transferMutation.isPending ? "TRANSFERRING..." : "RECORD TRANSFER"}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
