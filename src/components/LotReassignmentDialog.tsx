import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";

interface LotReassignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  currentLotId: string | null;
  currentLotName: string | null;
  revenue: number;
}

export function LotReassignmentDialog({
  open,
  onOpenChange,
  transactionId,
  currentLotId,
  currentLotName,
  revenue,
}: LotReassignmentDialogProps) {
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [correctionNote, setCorrectionNote] = useState("");
  const queryClient = useQueryClient();

  // Fetch all lots for current user
  const { data: lots, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots-for-reassignment"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("lots")
        .select("id, source, purchase_date, status")
        .eq("user_id", user.id)
        .order("purchase_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Filter out current lot
  const availableLots = lots?.filter(lot => lot.id !== currentLotId) || [];
  const selectedLot = availableLots.find(lot => lot.id === selectedLotId);

  // Mutation to reassign transaction
  const reassignMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // First get current correction_count
      const { data: currentTx, error: fetchError } = await supabase
        .from("transactions")
        .select("correction_count")
        .eq("id", transactionId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from("transactions")
        .update({
          lot_id: selectedLotId,
          correction_note: correctionNote,
          corrected_at: new Date().toISOString(),
          correction_count: (currentTx?.correction_count || 0) + 1,
        })
        .eq("id", transactionId)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      
      const newLotName = selectedLot?.source || "Unknown";
      toast({
        title: "Transaction reassigned",
        description: `Transaction reassigned to ${newLotName}`,
      });
      
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Reassignment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setSelectedLotId("");
    setCorrectionNote("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!selectedLotId) {
      toast({
        title: "Validation error",
        description: "Please select a lot",
        variant: "destructive",
      });
      return;
    }

    if (correctionNote.trim().length < 10) {
      toast({
        title: "Validation error",
        description: "Correction note must be at least 10 characters",
        variant: "destructive",
      });
      return;
    }

    if (correctionNote.length > 500) {
      toast({
        title: "Validation error",
        description: "Correction note must be less than 500 characters",
        variant: "destructive",
      });
      return;
    }

    reassignMutation.mutate();
  };

  const isValid = selectedLotId && correctionNote.trim().length >= 10 && correctionNote.length <= 500;
  const showClosedWarning = selectedLot && selectedLot.status !== "active";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reassign Transaction to Different Lot</DialogTitle>
          <DialogDescription>
            Move this transaction to a different lot. This will update revenue tracking for both lots.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="lot-select">Select New Lot</Label>
            <Select value={selectedLotId} onValueChange={setSelectedLotId} disabled={lotsLoading}>
              <SelectTrigger id="lot-select">
                <SelectValue placeholder={lotsLoading ? "Loading lots..." : "Select a lot"} />
              </SelectTrigger>
              <SelectContent>
                {availableLots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    <div className="flex items-center gap-2">
                      <span>{lot.source}</span>
                      <Badge variant={lot.status === "active" ? "default" : "secondary"} className="text-xs">
                        {lot.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableLots.length === 0 && !lotsLoading && (
              <p className="text-sm text-muted-foreground">No other lots available</p>
            )}
          </div>

          {showClosedWarning && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                Warning: You're reassigning to a {selectedLot.status} lot. This is allowed but may affect reporting.
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="correction-note">Correction Note *</Label>
            <Textarea
              id="correction-note"
              placeholder="Explain why reassigning (min 10 characters)..."
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              className="min-h-[100px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {correctionNote.length}/500 characters {correctionNote.length < 10 && `(${10 - correctionNote.length} more needed)`}
            </p>
          </div>

          {selectedLotId && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-1">Revenue Impact Preview</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-red-600">
                  Old lot ({currentLotName || "Unknown"}): -${revenue.toFixed(2)}
                </span>
                <span>→</span>
                <span className="text-green-600">
                  New lot ({selectedLot?.source || "Unknown"}): +${revenue.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={reassignMutation.isPending}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || reassignMutation.isPending}
            className="min-h-[44px]"
          >
            {reassignMutation.isPending ? "Reassigning..." : "Confirm Reassignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
