import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface ShowReassignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  currentShowId: string | null;
  currentShowName: string | null;
  revenue: number;
}

export function ShowReassignmentDialog({
  open,
  onOpenChange,
  transactionId,
  currentShowId,
  currentShowName,
  revenue,
}: ShowReassignmentDialogProps) {
  const [selectedShowId, setSelectedShowId] = useState<string>("");
  const [correctionNote, setCorrectionNote] = useState("");
  const queryClient = useQueryClient();

  // Fetch all shows excluding the current one
  const { data: shows = [] } = useQuery({
    queryKey: ["shows-for-reassignment", currentShowId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shows")
        .select("id, name, show_date, status")
        .eq("user_id", user.id)
        .neq("id", currentShowId || "")
        .order("show_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Mutation to reassign show using RPC function
  const reassignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("reassign_show_card_sale_to_show", {
        p_transaction_id: transactionId,
        p_new_show_id: selectedShowId,
        p_correction_note: correctionNote,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["show_cards"] });
      
      const newShowName = shows.find(s => s.id === selectedShowId)?.name || "selected show";
      toast({
        title: "Success",
        description: `Show card sale reassigned to ${newShowName}`,
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reassign show card sale",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setSelectedShowId("");
    setCorrectionNote("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!selectedShowId) {
      toast({
        title: "Validation Error",
        description: "Please select a show",
        variant: "destructive",
      });
      return;
    }

    if (correctionNote.trim().length < 10) {
      toast({
        title: "Validation Error",
        description: "Correction note must be at least 10 characters",
        variant: "destructive",
      });
      return;
    }

    if (correctionNote.length > 500) {
      toast({
        title: "Validation Error",
        description: "Correction note must be less than 500 characters",
        variant: "destructive",
      });
      return;
    }

    reassignMutation.mutate();
  };

  const selectedShow = shows.find(s => s.id === selectedShowId);
  const isClosedShow = selectedShow?.status === "closed";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reassign Show Card Sale to Different Show</DialogTitle>
          <DialogDescription>
            Move this sale from {currentShowName || "current show"} to another show. This will update both the transaction and show card records atomically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="show-select">New Show</Label>
            <Select value={selectedShowId} onValueChange={setSelectedShowId}>
              <SelectTrigger id="show-select">
                <SelectValue placeholder="Select a show..." />
              </SelectTrigger>
              <SelectContent>
                {shows.map((show) => (
                  <SelectItem key={show.id} value={show.id}>
                    <div className="flex items-center gap-2">
                      <span>{show.name}</span>
                      <Badge variant={show.status === "active" ? "default" : "secondary"}>
                        {show.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shows.length === 0 && (
              <p className="text-sm text-muted-foreground">No other shows available</p>
            )}
          </div>

          {isClosedShow && (
            <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
              ⚠️ Warning: You are reassigning to a closed show
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="correction-note">
              Correction Note <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="correction-note"
              placeholder="Explain why reassigning this sale..."
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              className="min-h-[100px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {correctionNote.length}/500 characters (minimum 10)
            </p>
          </div>

          {selectedShowId && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Revenue Impact Preview:</p>
              <p className="mt-1">
                Old show ({currentShowName}): -${revenue.toFixed(2)} |{" "}
                New show ({selectedShow?.name}): +${revenue.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
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
            disabled={
              !selectedShowId ||
              correctionNote.trim().length < 10 ||
              reassignMutation.isPending
            }
            className="min-h-[44px]"
          >
            {reassignMutation.isPending ? "Reassigning..." : "Confirm Reassignment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
