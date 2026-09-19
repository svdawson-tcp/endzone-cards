import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseRequiredAmount } from "@/lib/numericUtils";
import { EXPENSE_CATEGORIES } from "@/lib/moneyConstants";
import { useCashAccounts } from "@/hooks/useCashAccounts";

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  notes: string | null;
  show_id: string | null;
  paid_personally?: boolean | null;
  account_id?: string | null;
}

interface EditExpenseDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditExpenseDialog({
  expense,
  open,
  onOpenChange,
  onSaved,
}: EditExpenseDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useCashAccounts();

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [paidPersonally, setPaidPersonally] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when expense changes
  useEffect(() => {
    if (expense) {
      setAmount(expense.amount.toFixed(2));
      setCategory(expense.category);
      setExpenseDate(expense.expense_date);
      setNotes(expense.notes || "");
      setPaidPersonally(!!expense.paid_personally);
      setAccountId(expense.account_id || "");
      setErrors({});
    }
  }, [expense]);

  useEffect(() => {
    if (!paidPersonally && !accountId && accounts.length > 0) {
      setAccountId((accounts.find((a) => a.is_default) || accounts[0]).id);
    }
  }, [accounts, accountId, paidPersonally]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      newErrors.amount = "Amount must be greater than $0.00";
    }

    if (!category) {
      newErrors.category = "Please select a category";
    }

    if (!expenseDate) {
      newErrors.expenseDate = "Please select a date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!expense) throw new Error("No expense to update");

      const parsedAmount = parseRequiredAmount(amount);

      const { error } = await supabase
        .from("expenses")
        .update({
          amount: parsedAmount,
          category,
          expense_date: expenseDate,
          notes: notes.trim() || null,
          paid_personally: paidPersonally,
          account_id: paidPersonally ? null : accountId || null,
        })
        .eq("id", expense.id);

      if (error) throw error;
      // Note: the database trigger handles every cash_transactions change
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      toast({
        title: "Expense updated",
        description: `$${parseFloat(amount).toFixed(2)} ${category} expense saved`,
      });
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (validateForm()) {
      updateMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Amount */}
          <FormField
            label="Amount"
            htmlFor="edit-expense-amount"
            required
            error={errors.amount}
          >
            <CurrencyInput
              id="edit-expense-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="bg-white text-gray-900"
            />
          </FormField>

          {/* Category */}
          <FormField
            label="Category"
            htmlFor="edit-expense-category"
            required
            error={errors.category}
          >
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-white text-gray-900">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-gray-900">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Date */}
          <FormField
            label="Expense Date"
            htmlFor="edit-expense-date"
            required
            error={errors.expenseDate}
          >
            <DateInput
              id="edit-expense-date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="bg-white text-gray-900"
            />
          </FormField>

          {/* Paid personally */}
          <div className="flex items-center justify-between gap-4 rounded-md border border-input p-3 min-h-[44px]">
            <Label htmlFor="edit-paid-personally" className="cursor-pointer text-foreground">
              I paid with my own money (reimburse me)
            </Label>
            <Switch
              id="edit-paid-personally"
              checked={paidPersonally}
              onCheckedChange={setPaidPersonally}
            />
          </div>

          {/* Paid from */}
          {!paidPersonally && (
            <FormField label="Paid from" htmlFor="edit-expense-account">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id} className="text-gray-900">
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {/* Notes */}
          <FormField label="Notes" htmlFor="edit-expense-notes">
            <Textarea
              id="edit-expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              maxLength={500}
              className="bg-white text-gray-900 placeholder:text-gray-400"
            />
          </FormField>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex-1 bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
