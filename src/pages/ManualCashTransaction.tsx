import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer } from "@/components/layout/AppLayout";
import { parseRequiredAmount } from "@/lib/numericUtils";
import { todayLocal } from "@/lib/dateUtils";
import { CASH_TYPE_LABELS } from "@/lib/moneyConstants";
import { useCashAccounts } from "@/hooks/useCashAccounts";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

type CashEntryType = "owner_contribution" | "owner_draw" | "reimbursement" | "deposit" | "adjustment";

const ALLOWED_TYPES: CashEntryType[] = [
  "owner_contribution",
  "owner_draw",
  "reimbursement",
  "deposit",
  "adjustment",
];

const HELPER_TEXT: Record<CashEntryType, string> = {
  owner_contribution:
    "Money put into the business by an owner or backer (for example, a gift). Not income.",
  owner_draw: "Money taken out for personal use (pay).",
  reimbursement: "Paying yourself back for business costs you covered personally.",
  deposit: "Add cash to the business from an external source.",
  adjustment: "Correct cash balance discrepancies.",
};

const ManualCashTransaction = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("type") as CashEntryType | null;
  const type: CashEntryType = requested && ALLOWED_TYPES.includes(requested) ? requested : "deposit";

  const { isViewingAsMentor, getEffectiveUserId, viewingUserId } = useMentorAccess();
  const { data: accounts = [] } = useCashAccounts();

  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"add" | "remove">("add");

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId((accounts.find((a) => a.is_default) || accounts[0]).id);
    }
  }, [accounts, accountId]);

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  // Amount currently owed back to the owner (for reimbursements)
  const { data: owedToOwner } = useQuery({
    queryKey: ["owedToOwner", viewingUserId],
    enabled: type === "reimbursement",
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_dashboard_metrics", {
        p_user_id: userId,
        p_start: null,
        p_end: null,
      });
      if (error) throw error;
      return Number((data as any)?.owed_to_owner || 0);
    },
  });

  const insertMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!accountId) throw new Error("Please choose an account");

      const magnitude = parseRequiredAmount(amount);
      let signedAmount = magnitude;

      if (type === "owner_draw" || type === "reimbursement") {
        signedAmount = -magnitude;
      } else if (type === "adjustment") {
        signedAmount = adjustmentDirection === "remove" ? -magnitude : magnitude;
      }

      const { error } = await supabase.from("cash_transactions").insert({
        user_id: user.id,
        account_id: accountId,
        transaction_type: type,
        amount: signedAmount,
        entry_date: entryDate,
        notes: notes.trim() || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${CASH_TYPE_LABELS[type]} recorded: $${parseFloat(amount).toFixed(2)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["owedToOwner"] });
      navigate("/dashboard");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Amount required",
        description: "Please enter an amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (!entryDate) {
      toast({
        title: "Date required",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    if (!accountId) {
      toast({
        title: "Account required",
        description: "Please choose which account this belongs to",
        variant: "destructive",
      });
      return;
    }

    insertMutation.mutate();
  };

  const title = `RECORD ${CASH_TYPE_LABELS[type].toUpperCase()}`;

  if (isViewingAsMentor) {
    return (
      <PageContainer maxWidth="2xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <h1 className="text-h1 mb-2">{title}</h1>
        <div className="bg-card shadow-card-shadow rounded-lg p-6">
          <p className="text-muted-foreground">
            You are viewing another account in read-only mentor view. Cash entries cannot be recorded here.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <h1 className="text-h1 mb-2">{title}</h1>
      <p className="text-muted-foreground mb-6">{HELPER_TEXT[type]}</p>

      <div className="bg-card shadow-card-shadow rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Badge className="bg-[hsl(var(--navy-base))] text-white">{CASH_TYPE_LABELS[type]}</Badge>
          </div>

          {type === "adjustment" && (
            <FormField
              label="Direction"
              required
              htmlFor="direction"
              helperText="Select whether to add or remove cash from balance"
            >
              <RadioGroup
                value={adjustmentDirection}
                onValueChange={(value: "add" | "remove") => setAdjustmentDirection(value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="add" id="add" />
                  <Label htmlFor="add" className="cursor-pointer">Add Cash (+)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="remove" id="remove" />
                  <Label htmlFor="remove" className="cursor-pointer">Remove Cash (-)</Label>
                </div>
              </RadioGroup>
            </FormField>
          )}

          {type === "reimbursement" && (
            <div className="rounded-md border border-input bg-muted/30 p-3 text-sm">
              Currently owed back to you:{" "}
              <strong>${Number(owedToOwner || 0).toFixed(2)}</strong>
            </div>
          )}

          <FormField
            label="Amount"
            required
            htmlFor="amount"
            helperText="Enter amount as a positive number"
          >
            <CurrencyInput
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </FormField>

          <FormField label="Account" required htmlFor="account">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="account" className="min-h-[44px]">
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

          <FormField label="Date" required htmlFor="entryDate">
            <DateInput
              id="entryDate"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              max={todayLocal()}
              required
            />
          </FormField>

          <FormField
            label="Notes (Optional)"
            htmlFor="notes"
            helperText="Reason for this entry"
          >
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for this entry..."
              rows={3}
            />
          </FormField>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="flex-1 min-h-[44px]"
            >
              CANCEL
            </Button>
            <Button
              type="submit"
              className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={insertMutation.isPending}
            >
              {insertMutation.isPending ? "RECORDING..." : `RECORD ${CASH_TYPE_LABELS[type].toUpperCase()}`}
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
};

export default ManualCashTransaction;
