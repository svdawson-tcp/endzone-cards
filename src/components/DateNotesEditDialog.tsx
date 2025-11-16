import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/forms/DateInput";
import { toast } from "@/hooks/use-toast";
import { Calendar, FileText } from "lucide-react";

interface DateNotesEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  currentDate: string;
  currentNotes: string | null;
}

export function DateNotesEditDialog({
  open,
  onOpenChange,
  transactionId,
  currentDate,
  currentNotes,
}: DateNotesEditDialogProps) {
  const [transactionDate, setTransactionDate] = useState(currentDate);
  const [notes, setNotes] = useState(currentNotes || "");
  const [correctionNote, setCorrectionNote] = useState("");
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Get current correction_count
      const { data: currentData, error: fetchError } = await supabase
        .from("transactions")
        .select("correction_count")
        .eq("id", transactionId)
        .single();

      if (fetchError) throw fetchError;

      const currentCount = currentData?.correction_count || 0;

      // Update transaction
      const { error } = await supabase
        .from("transactions")
        .update({
          transaction_date: transactionDate,
          notes: notes.trim() || null,
          correction_note: correctionNote,
          corrected_at: new Date().toISOString(),
          correction_count: currentCount + 1,
        })
        .eq("id", transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      toast({
        title: "Transaction date/notes updated",
        description: "The changes have been saved successfully.",
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Error updating transaction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setTransactionDate(currentDate);
    setNotes(currentNotes || "");
    setCorrectionNote("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    // Validation
    if (!transactionDate) {
      toast({
        title: "Validation error",
        description: "Transaction date is required.",
        variant: "destructive",
      });
      return;
    }

    if (new Date(transactionDate) > new Date()) {
      toast({
        title: "Validation error",
        description: "Transaction date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if (correctionNote.trim().length < 10) {
      toast({
        title: "Validation error",
        description: "Correction note must be at least 10 characters.",
        variant: "destructive",
      });
      return;
    }

    if (correctionNote.length > 500) {
      toast({
        title: "Validation error",
        description: "Correction note must be less than 500 characters.",
        variant: "destructive",
      });
      return;
    }

    if (notes.length > 500) {
      toast({
        title: "Validation error",
        description: "Notes must be less than 500 characters.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate();
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Transaction Date/Notes</DialogTitle>
          <DialogDescription>
            Update the transaction date and notes. You must provide a reason for this correction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Update Transaction Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Update Transaction</h3>
            
            <div className="space-y-2">
              <Label htmlFor="transaction-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Transaction Date
              </Label>
              <DateInput
                id="transaction-date"
                value={transactionDate}
                max={today}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add transaction notes..."
                className="min-h-[80px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {notes.length}/500 characters
              </p>
            </div>
          </div>

          {/* Correction Note Section */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-destructive">
              Correction Note (Required)
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="correction-note">
                Explain why you're making this correction
              </Label>
              <Textarea
                id="correction-note"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Explain correction... (minimum 10 characters)"
                className="min-h-[80px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {correctionNote.length}/500 characters
                {correctionNote.length < 10 && correctionNote.length > 0 && (
                  <span className="text-destructive ml-2">
                    (minimum 10)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={updateMutation.isPending}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={updateMutation.isPending}
            className="min-h-[44px]"
          >
            {updateMutation.isPending ? "Updating..." : "Confirm Update"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
