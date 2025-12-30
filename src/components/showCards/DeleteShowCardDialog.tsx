import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ShowCard {
  id: string;
  player_name: string;
  status: string;
}

interface DeleteShowCardDialogProps {
  showCard: ShowCard;
  onDeleted?: () => void;
}

export const DeleteShowCardDialog = ({ showCard, onDeleted }: DeleteShowCardDialogProps) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // First delete any related transactions
      const { error: txError } = await supabase
        .from("transactions")
        .delete()
        .eq("show_card_id", showCard.id);

      if (txError) throw txError;

      // Then delete the show card
      const { error } = await supabase
        .from("show_cards")
        .delete()
        .eq("id", showCard.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-cards"] });
      toast.success("Show card deleted");
      setOpen(false);
      onDeleted?.();
    },
    onError: (error) => {
      toast.error("Failed to delete show card", {
        description: error.message,
      });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Show Card?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{showCard.player_name}"?
            {showCard.status === "sold" && (
              <span className="block mt-2 text-destructive font-medium">
                Warning: This card has been sold. Deleting it will also remove the sale transaction.
              </span>
            )}
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
