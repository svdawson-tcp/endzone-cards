import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

interface DeleteTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  transactionType: string;
  revenue: number;
  showCardId?: string | null;
}

export function DeleteTransactionDialog({
  open,
  onOpenChange,
  transactionId,
  transactionType,
  revenue,
  showCardId,
}: DeleteTransactionDialogProps) {
  const [deletionReason, setDeletionReason] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const { isViewingAsMentor } = useMentorAccess();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Validate reason
      if (deletionReason.trim().length < 10) {
        throw new Error("Deletion reason must be at least 10 characters");
      }
      if (deletionReason.trim().length > 500) {
        throw new Error("Deletion reason must be less than 500 characters");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Mark transaction as deleted
      const { error: transactionError } = await supabase
        .from("transactions")
        .update({
          deleted: true,
          deleted_at: new Date().toISOString(),
          deletion_reason: deletionReason.trim(),
        })
        .eq("id", transactionId)
        .eq("user_id", user.id);

      if (transactionError) throw transactionError;

      // 2. If show_card_sale, update show card status back to available
      if (transactionType === "show_card_sale" && showCardId) {
        const { error: showCardError } = await supabase
          .from("show_cards")
          .update({ status: "available", updated_at: new Date().toISOString() })
          .eq("id", showCardId)
          .eq("user_id", user.id);

        if (showCardError) throw showCardError;
      }

      // 3. Create offsetting cash transaction (reversal)
      const { error: cashError } = await supabase
        .from("cash_transactions")
        .insert({
          user_id: user.id,
          transaction_type: "adjustment",
          amount: -revenue,
          notes: `Reversal for deleted transaction ${transactionId}`,
          related_transaction_id: transactionId,
          created_at: new Date().toISOString(),
        });

      if (cashError) throw cashError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["show_cards"] });
      queryClient.invalidateQueries({ queryKey: ["totalRevenue"] });
      queryClient.invalidateQueries({ queryKey: ["premiumSales"] });
      queryClient.invalidateQueries({ queryKey: ["bulkSales"] });
      
      toast({
        title: "Transaction deleted",
        description: "Transaction deleted and cash reversed",
      });
      
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setDeletionReason("");
    setError("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    setError("");
    
    if (deletionReason.trim().length < 10) {
      setError("Deletion reason must be at least 10 characters");
      return;
    }
    if (deletionReason.trim().length > 500) {
      setError("Deletion reason must be less than 500 characters");
      return;
    }

    deleteMutation.mutate();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Delete Transaction
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Are you sure you want to delete this transaction? This will:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Mark the transaction as deleted</li>
              <li>Create a cash reversal entry for ${revenue.toFixed(2)}</li>
              {transactionType === "show_card_sale" && (
                <li>Return the show card to "available" status</li>
              )}
            </ul>
            <p className="text-sm font-medium">This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="deletion-reason" className="text-sm font-medium">
            Deletion Reason <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="deletion-reason"
            placeholder="Enter reason for deleting this transaction (10-500 characters)"
            value={deletionReason}
            onChange={(e) => setDeletionReason(e.target.value)}
            className="min-h-[100px]"
            maxLength={500}
          />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{deletionReason.length}/500 characters</span>
            {error && <span className="text-destructive">{error}</span>}
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteMutation.isPending || deletionReason.trim().length < 10 || isViewingAsMentor}
          >
            {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
