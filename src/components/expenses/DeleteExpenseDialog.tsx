import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Expense {
  id: string;
  amount: number;
  category: string;
}

interface DeleteExpenseDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteExpenseDialog({
  expense,
  open,
  onOpenChange,
  onDeleted,
}: DeleteExpenseDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!expense) throw new Error("No expense to delete");

      // First, delete linked cash_transaction (no cascade trigger exists)
      const { error: cashError } = await supabase
        .from("cash_transactions")
        .delete()
        .eq("related_expense_id", expense.id);

      if (cashError) throw cashError;

      // Then delete the expense itself
      const { error: expenseError } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expense.id);

      if (expenseError) throw expenseError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      toast({
        title: "Expense deleted",
        description: `$${expense?.amount.toFixed(2)} ${expense?.category} expense removed`,
      });
      onOpenChange(false);
      onDeleted();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete expense",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Expense
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this{" "}
            <strong>${expense?.amount.toFixed(2)} {expense?.category}</strong> expense?
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
