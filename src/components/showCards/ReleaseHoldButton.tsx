import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { formatMoment, functionErrorMessage, isFuture } from "@/lib/webShop";

interface ReleaseHoldButtonProps {
  cardId: string;
  playerName: string;
  heldUntil: string | null | undefined;
  /** "compact" for the card list, "full" for the card page */
  variant?: "compact" | "full";
}

/**
 * "Release hold" for a card that's on hold for an online buyer (cssportscards.com checkout or accepted offer).
 * The release-hold function closes the buyer's Stripe checkout first, so nobody can pay for a released card.
 */
export function ReleaseHoldButton({ cardId, playerName, heldUntil, variant = "compact" }: ReleaseHoldButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { isViewingAsMentor } = useMentorAccess();

  if (!isFuture(heldUntil) || isViewingAsMentor) return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation(); // the card list row navigates on click

  const release = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("release-hold", { body: { card_id: cardId } });
      if (error) {
        const message = await functionErrorMessage(error, "Couldn't reach the website. Please try again.");
        toast.error("Hold not released", { description: message });
        return;
      }
      toast.success(`${playerName} is back for sale`);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["show-cards"] });
      queryClient.invalidateQueries({ queryKey: ["show-card", cardId] });
      queryClient.invalidateQueries({ queryKey: ["webOffers"] });
      queryClient.invalidateQueries({ queryKey: ["webShopCounts"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={variant === "compact" ? "h-10 whitespace-nowrap px-3 text-xs" : "ml-2 mt-2 min-h-[44px]"}
        onClick={(e) => { e.preventDefault(); stop(e); setOpen(true); }}
        aria-label={`Release the online hold on ${playerName}`}
      >
        <Unlock className="mr-1 h-4 w-4" />
        Release hold
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent onClick={stop}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Release {playerName}?</AlertDialogTitle>
            <AlertDialogDescription>
              An online buyer has this card on hold until {formatMoment(heldUntil, "h:mm a")}. Releasing it closes
              their checkout so they can't pay. If they had an accepted offer, the offer is cancelled and they get
              an email. Do this only if you're selling the card another way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]" disabled={busy}>Keep the hold</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); release(); }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Release hold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
