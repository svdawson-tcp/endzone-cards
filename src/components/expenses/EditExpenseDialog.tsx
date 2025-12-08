import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

const EXPENSE_CATEGORIES = [
  "Booth Fee",
  "Travel",
  "Supplies",
  "Meals",
  "Other",
] as const;

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  notes: string | null;
  show_id: string | null;
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

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when expense changes
  useEffect(() => {
    if (expense) {
      setAmount(expense.amount.toFixed(2));
      setCategory(expense.category);
      setExpenseDate(expense.expense_date);
      setNotes(expense.notes || "");
      setErrors({});
    }
  }, [expense]);

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
        })
        .eq("id", expense.id);

      if (error) throw error;
      // Note: sync_cash_on_expense_update trigger handles cash_transactions update
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
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
      <DialogContent className="sm:max-w-md">
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
              <SelectTrigger className="bg-white text-card-foreground">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
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
            />
          </FormField>

          {/* Notes */}
          <FormField label="Notes" htmlFor="edit-expense-notes">
            <Textarea
              id="edit-expense-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              maxLength={500}
              className="bg-white text-card-foreground placeholder:opacity-50"
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
