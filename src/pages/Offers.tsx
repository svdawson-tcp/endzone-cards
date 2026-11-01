import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
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
import { WebsiteSettingsCard } from "@/components/website/WebsiteSettingsCard";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { formatMoney, normalizeMoneyInput } from "@/lib/numericUtils";
import { cardTitle, formatMoment, functionErrorMessage, isFuture, validateCounter } from "@/lib/webShop";
import type { Json } from "@/integrations/supabase/types";

const PAGE_SIZE = 50;

type OfferRow = {
  id: string;
  show_card_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_note: string | null;
  amount: number;
  asking_at_offer: number;
  floor_at_offer: number;
  status: string;
  auto_accepted: boolean;
  counter_amount: number | null;
  final_amount: number | null;
  pay_expires_at: string | null;
  order_id: string | null;
  responded_at: string | null;
  created_at: string;
  show_cards: {
    player_name: string;
    year: string | null;
    card_details: Json | null;
    photo_front_url: string | null;
  } | null;
  web_orders: { order_number: string; status: string } | null;
};

type OfferAction = "accept" | "decline" | "counter";

/** Plain-language status line for an offer that is no longer waiting on Colton. */
function offerStatusText(offer: OfferRow): { label: string; detail?: string; tone: "good" | "wait" | "muted" } {
  const until = formatMoment(offer.pay_expires_at);
  const linkLive = isFuture(offer.pay_expires_at);
  switch (offer.status) {
    case "accepted":
      return {
        label: offer.auto_accepted ? "Auto-accepted" : "Accepted",
        detail: linkLive ? `Awaiting payment until ${until}` : "Payment link expired",
        tone: linkLive ? "wait" : "muted",
      };
    case "countered":
      return {
        label: `Countered at ${formatMoney(offer.counter_amount)}`,
        detail: linkLive ? `Awaiting payment until ${until}` : "Payment link expired",
        tone: linkLive ? "wait" : "muted",
      };
    case "paid":
      return {
        label: `Paid ${formatMoney(offer.final_amount)}`,
        detail: offer.auto_accepted ? "Auto-accepted offer" : undefined,
        tone: "good",
      };
    case "declined":
      return { label: "Declined", tone: "muted" };
    case "expired":
      return { label: "Expired", detail: "Buyer didn't pay in time", tone: "muted" };
    case "withdrawn":
      return { label: "Withdrawn by buyer", tone: "muted" };
    default:
      return { label: offer.status, tone: "muted" };
  }
}

export default function Offers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();

  const [pages, setPages] = useState(1);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counterInput, setCounterInput] = useState("");
  const [counterTouched, setCounterTouched] = useState(false);
  const [confirming, setConfirming] = useState<{ offer: OfferRow; action: "accept" | "decline" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: offers, isLoading } = useQuery({
    queryKey: ["webOffers", viewingUserId, pages],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("web_offers")
        .select(
          `id, show_card_id, buyer_name, buyer_email, buyer_note, amount, asking_at_offer, floor_at_offer,
           status, auto_accepted, counter_amount, final_amount, pay_expires_at, order_id, responded_at, created_at,
           show_cards (player_name, year, card_details, photo_front_url),
           web_orders!web_offers_order_id_fkey (order_number, status)`,
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(0, pages * PAGE_SIZE - 1);
      if (error) throw error;
      return (data || []) as unknown as OfferRow[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["webOffers"] });
    queryClient.invalidateQueries({ queryKey: ["webShopCounts"] });
    queryClient.invalidateQueries({ queryKey: ["show-cards"] });
  };

  const respond = async (offer: OfferRow, action: OfferAction, counterAmount?: string) => {
    setBusyId(offer.id);
    try {
      const { error } = await supabase.functions.invoke("offer-respond", {
        body: {
          offer_id: offer.id,
          action,
          counter_amount: action === "counter" ? Number(counterAmount) : undefined,
        },
      });
      if (error) {
        const message = await functionErrorMessage(error, "Couldn't reach the website. Please try again.");
        toast({ title: "Offer not updated", description: message, variant: "destructive" });
        return;
      }
      toast({
        title:
          action === "accept"
            ? "Offer accepted"
            : action === "counter"
              ? "Counteroffer sent"
              : "Offer declined",
        description:
          action === "decline"
            ? `${offer.buyer_name} will get an email.`
            : `${offer.buyer_name} was emailed a payment link. The card is held for them.`,
      });
      setCounterFor(null);
      setCounterInput("");
      setCounterTouched(false);
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const openCounter = (offer: OfferRow) => {
    setCounterFor(offer.id);
    setCounterInput("");
    setCounterTouched(false);
  };

  const sendCounter = (offer: OfferRow) => {
    setCounterTouched(true);
    if (validateCounter(counterInput, offer)) return;
    respond(offer, "counter", normalizeMoneyInput(counterInput)!);
  };

  const pendingCount = (offers || []).filter((o) => o.status === "pending").length;
  const hasMore = (offers?.length || 0) >= pages * PAGE_SIZE;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-32 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground md:text-3xl">Offers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Offers from cssportscards.com.{" "}
          {pendingCount > 0 ? `${pendingCount} waiting for you.` : "Nothing waiting for you."}
        </p>
      </div>

      <div className="night-game-card p-4 md:p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full bg-muted/20" />
            ))}
          </div>
        ) : !offers || offers.length === 0 ? (
          <div className="py-8 text-center">
            <HandCoins className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No offers yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {offers.map((offer) => {
              const card = offer.show_cards;
              const pending = offer.status === "pending";
              const pctOfAsking =
                Number(offer.asking_at_offer) > 0
                  ? Math.round((Number(offer.amount) / Number(offer.asking_at_offer)) * 100)
                  : null;
              const status = pending ? null : offerStatusText(offer);
              const counterError =
                counterFor === offer.id && counterTouched ? validateCounter(counterInput, offer) : undefined;
              const busy = busyId === offer.id;

              return (
                <div key={offer.id} className="space-y-3 py-4 first:pt-0 last:pb-0" data-testid="offer-row">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/show-cards/${offer.show_card_id}`)}
                      className="shrink-0"
                      aria-label="Open card"
                    >
                      {card?.photo_front_url ? (
                        <img
                          src={card.photo_front_url}
                          alt={`${card.player_name} card front`}
                          className="h-[88px] w-16 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-[88px] w-16 items-center justify-center rounded-md bg-muted">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-foreground">{cardTitle(card)}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {offer.buyer_name} · {offer.buyer_email}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-lg font-bold text-foreground">{formatMoney(offer.amount)}</span>
                        <span className="text-xs text-muted-foreground">
                          of {formatMoney(offer.asking_at_offer)} asking{pctOfAsking !== null && ` (${pctOfAsking}%)`}
                        </span>
                        <span className="text-xs text-muted-foreground">Floor {formatMoney(offer.floor_at_offer)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatMoment(offer.created_at)}</p>
                    </div>
                  </div>

                  {offer.buyer_note && (
                    <p className="whitespace-pre-wrap break-words rounded-md bg-muted/20 px-3 py-2 text-sm text-foreground/90">
                      “{offer.buyer_note}”
                    </p>
                  )}

                  {pending ? (
                    <>
                      <Badge className="text-xs">Waiting for you</Badge>
                      {!isViewingAsMentor && counterFor !== offer.id && (
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            className="min-h-[44px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                            disabled={busy}
                            onClick={() => setConfirming({ offer, action: "accept" })}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept"}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-[44px] font-semibold"
                            disabled={busy}
                            onClick={() => openCounter(offer)}
                          >
                            Counter
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-[44px] font-semibold text-destructive"
                            disabled={busy}
                            onClick={() => setConfirming({ offer, action: "decline" })}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                      {!isViewingAsMentor && counterFor === offer.id && (
                        <div className="space-y-2">
                          <label htmlFor={`counter-${offer.id}`} className="form-label">
                            Your counteroffer
                          </label>
                          <CurrencyInput
                            id={`counter-${offer.id}`}
                            value={counterInput}
                            onChange={(e) => setCounterInput(e.target.value)}
                            onBlur={() => setCounterTouched(true)}
                            placeholder={Number(offer.asking_at_offer).toFixed(2)}
                            autoFocus
                          />
                          <p className="text-xs text-muted-foreground">
                            More than {formatMoney(offer.amount)}, up to {formatMoney(offer.asking_at_offer)}. The buyer
                            gets a payment link at this price.
                          </p>
                          {counterError && <p className="text-sm text-destructive">{counterError}</p>}
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              className="min-h-[44px]"
                              disabled={busy}
                              onClick={() => setCounterFor(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              className="min-h-[44px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                              disabled={busy}
                              onClick={() => sendCounter(offer)}
                            >
                              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Send counter
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    status && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={status.tone === "good" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {status.label}
                        </Badge>
                        {status.detail && <span className="text-xs text-muted-foreground">{status.detail}</span>}
                        {offer.status === "paid" && offer.web_orders?.order_number && (
                          <Button
                            variant="link"
                            className="min-h-[44px] px-1 text-accent"
                            onClick={() => navigate(`/web-orders?order=${encodeURIComponent(offer.web_orders!.order_number)}`)}
                          >
                            Order {offer.web_orders.order_number} →
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })}
            {hasMore && (
              <div className="pt-4 text-center">
                <Button variant="outline" className="min-h-[44px]" onClick={() => setPages((p) => p + 1)}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <WebsiteSettingsCard />

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {confirming?.action === "accept"
                ? `Accept ${formatMoney(confirming?.offer.amount)}?`
                : `Decline ${formatMoney(confirming?.offer.amount)}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.action === "accept"
                ? `${confirming?.offer.buyer_name} gets a payment link and the card is held for them until they pay.`
                : `${confirming?.offer.buyer_name} gets an email saying the offer wasn't accepted. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Back</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={() => {
                if (confirming) respond(confirming.offer, confirming.action);
                setConfirming(null);
              }}
            >
              {confirming?.action === "accept" ? "Accept offer" : "Decline offer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
