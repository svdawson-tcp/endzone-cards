import { useState } from "react";
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
import { PageContainer } from "@/components/layout/AppLayout";
import { parseRequiredAmount } from "@/lib/numericUtils";

const ManualCashTransaction = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") as "deposit" | "withdrawal" | "adjustment" || "deposit";

  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [notes, setNotes] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"add" | "remove">("add");

  // Get current user
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const insertMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Calculate signed amount
      let signedAmount = amount;
      if (type === "withdrawal") {
        signedAmount = `-${amount}`;
      } else if (type === "adjustment") {
        signedAmount = adjustmentDirection === "remove" ? `-${amount}` : amount;
      }

      // Build timestamp: user's selected date + current time
      const now = new Date();
      const [year, month, day] = transactionDate.split('-');
      const userDateTime = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds()
      );

      // Insert record first (created_at will default to now())
      const { data: inserted, error: insertError } = await supabase
        .from("cash_transactions")
        .insert({
          transaction_type: type,
          amount: parseRequiredAmount(signedAmount),
          notes: notes.trim() || null,
          user_id: user.id,
          related_expense_id: null,
          related_lot_id: null,
          related_transaction_id: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update with user-selected date + current time
      const { error: updateError } = await supabase
        .from("cash_transactions")
        .update({ created_at: userDateTime.toISOString() })
        .eq("id", inserted.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const amountFormatted = parseFloat(amount).toFixed(2);
      toast({
        title: "Success",
        description: `Cash ${type} recorded: $${amountFormatted}`,
      });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] });
      navigate("/dashboard");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: "Amount required",
        description: "Please enter an amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (!transactionDate) {
      toast({
        title: "Date required",
        description: "Please select a transaction date",
        variant: "destructive",
      });
      return;
    }

    if (type === "adjustment" && !adjustmentDirection) {
      toast({
        title: "Direction required",
        description: "Please select add or remove cash",
        variant: "destructive",
      });
      return;
    }

    insertMutation.mutate();
  };

  // Page configuration based on type
  const config = {
    deposit: {
      title: "RECORD CASH DEPOSIT",
      subtitle: "Add cash to business from external source",
      badge: { variant: "default" as const, label: "Deposit", className: "bg-green-600 text-white" },
      buttonText: "RECORD DEPOSIT",
    },
    withdrawal: {
      title: "RECORD CASH WITHDRAWAL",
      subtitle: "Remove cash from business for personal use",
      badge: { variant: "destructive" as const, label: "Withdrawal", className: "bg-red-600 text-white" },
      buttonText: "RECORD WITHDRAWAL",
    },
    adjustment: {
      title: "ADJUST CASH BALANCE",
      subtitle: "Correct cash balance discrepancies",
      badge: { variant: "secondary" as const, label: "Adjustment", className: "bg-yellow-600 text-white" },
      buttonText: "RECORD ADJUSTMENT",
    },
  };

  const currentConfig = config[type];

  return (
    <PageContainer maxWidth="2xl">
      <Button
        variant="ghost"
        onClick={() => navigate("/dashboard")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <h1 className="text-h1 mb-2">{currentConfig.title}</h1>
      <p className="text-muted-foreground mb-6">{currentConfig.subtitle}</p>

      <div className="bg-card shadow-card-shadow rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Badge className={currentConfig.badge.className}>
              {currentConfig.badge.label}
            </Badge>
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
                  <Label htmlFor="add" className="cursor-pointer text-gray-900">Add Cash (+)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="remove" id="remove" />
                  <Label htmlFor="remove" className="cursor-pointer text-gray-900">Remove Cash (-)</Label>
                </div>
              </RadioGroup>
            </FormField>
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

          <FormField
            label="Transaction Date"
            required
            htmlFor="transactionDate"
          >
            <DateInput
              id="transactionDate"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
            />
          </FormField>

          <FormField
            label="Notes (Optional)"
            htmlFor="notes"
            helperText="Reason for this transaction"
          >
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for this transaction..."
              rows={3}
            />
          </FormField>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="flex-1"
            >
              CANCEL
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#041E42] hover:bg-[#0A2E63] text-white"
              disabled={insertMutation.isPending}
            >
              {insertMutation.isPending ? "RECORDING..." : currentConfig.buttonText}
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
};

export default ManualCashTransaction;
