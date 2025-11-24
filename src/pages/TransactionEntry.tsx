import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Package, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type TransactionType = "show_card_sale" | "bulk_sale" | "disposition";
type DispositionType = "discard" | "lost" | "combined";

export default function TransactionEntry() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [transactionType, setTransactionType] = useState<TransactionType>("show_card_sale");
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [selectedShowId, setSelectedShowId] = useState<string>("");
  const [revenue, setRevenue] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [dispositionType, setDispositionType] = useState<DispositionType>("discard");
  const [destinationLotId, setDestinationLotId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionDate, setTransactionDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Fetch available show cards
  const { data: showCards, isLoading: loadingCards } = useQuery({
    queryKey: ["available-show-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("show_cards")
        .select("id, player_name, year, asking_price")
        .eq("status", "available")
        .order("player_name");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch active lots
  const { data: lots, isLoading: loadingLots } = useQuery({
    queryKey: ["active-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, source, purchase_date, total_cost")
        .eq("status", "active")
        .order("purchase_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch shows
  const { data: shows, isLoading: loadingShows } = useQuery({
    queryKey: ["active-shows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("id, name, show_date")
        .in("status", ["planned", "active"])
        .order("show_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Auto-fill revenue when card is selected
  const handleCardSelection = (cardId: string) => {
    setSelectedCardId(cardId);
    const card = showCards?.find(c => c.id === cardId);
    if (card?.asking_price && !revenue) {
      setRevenue(card.asking_price.toString());
    }
  };

  const isFormValid = () => {
    if (transactionType === "show_card_sale") {
      return selectedCardId && revenue && parseFloat(revenue) > 0;
    }
    if (transactionType === "bulk_sale") {
      return selectedLotId && quantity && parseInt(quantity) > 0 && revenue && parseFloat(revenue) > 0;
    }
    if (transactionType === "disposition") {
      if (!selectedCardId) return false;
      if (dispositionType === "combined" && !destinationLotId) return false;
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (transactionType === "show_card_sale") {
        const { error } = await supabase
          .from("transactions")
          .insert({
            user_id: user.id,
            transaction_type: "show_card_sale",
            show_card_id: selectedCardId,
            show_id: selectedShowId || null,
            quantity: 1,
            revenue: revenue as any,
            transaction_date: transactionDate,
            notes: notes || null,
          });

        if (error) throw error;

        toast({
          title: "Sale recorded successfully!",
          description: "Cash balance updated and card marked as sold.",
        });
      } else if (transactionType === "bulk_sale") {
        const { error } = await supabase
          .from("transactions")
          .insert({
            user_id: user.id,
            transaction_type: "bulk_sale",
            lot_id: selectedLotId,
            show_id: selectedShowId || null,
            quantity: parseInt(quantity),
            revenue: revenue as any,
            transaction_date: transactionDate,
            notes: notes || null,
          });

        if (error) throw error;

        toast({
          title: "Bulk sale recorded!",
          description: `${quantity} cards sold. Cash balance updated.`,
        });
      } else if (transactionType === "disposition") {
        // Insert transaction
        const { error: transError } = await supabase
          .from("transactions")
          .insert({
            user_id: user.id,
            transaction_type: "disposition",
            show_card_id: selectedCardId,
            quantity: 1,
            revenue: 0,
            transaction_date: transactionDate,
            notes: notes || null,
          });

        if (transError) throw transError;

        // Update show card
        const { error: cardError } = await supabase
          .from("show_cards")
          .update({
            status: dispositionType === "lost" ? "lost" : dispositionType === "combined" ? "combined" : "available",
            disposition_type: dispositionType === "combined" ? "combined_into" : dispositionType,
            destination_lot_id: dispositionType === "combined" ? destinationLotId : null,
          })
          .eq("id", selectedCardId);

        if (cardError) throw cardError;

        toast({
          title: "Disposition recorded!",
          description: `Card ${dispositionType === "combined" ? "combined into lot" : dispositionType}.`,
        });
      }

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Transaction error:", error);
      toast({
        title: "Error recording transaction",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-background pb-32 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Page Title - Uses page-title class for white text on dark background */}
        <h1 className="page-title mb-6">RECORD SALE</h1>

        <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-6">
          {/* Transaction Type Selector */}
          <div>
            <label className="form-label text-base font-semibold mb-3 block">Transaction Type</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setTransactionType("show_card_sale")}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-h-[100px]",
                  transactionType === "show_card_sale"
                    ? "bg-[hsl(var(--navy-base))] text-white border-[hsl(var(--navy-base))]"
                    : "border-input hover:bg-muted/50 text-card-foreground"
                )}
              >
                <CreditCard size={32} className="mb-2" />
                <span className="text-sm font-medium">Show Card Sale</span>
              </button>

              <button
                type="button"
                onClick={() => setTransactionType("bulk_sale")}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-h-[100px]",
                  transactionType === "bulk_sale"
                    ? "bg-[hsl(var(--navy-base))] text-white border-[hsl(var(--navy-base))]"
                    : "border-input hover:bg-muted/50 text-card-foreground"
                )}
              >
                <Package size={32} className="mb-2" />
                <span className="text-sm font-medium">Bulk Sale</span>
              </button>

              <button
                type="button"
                onClick={() => setTransactionType("disposition")}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all min-h-[100px]",
                  transactionType === "disposition"
                    ? "bg-[hsl(var(--navy-base))] text-white border-[hsl(var(--navy-base))]"
                    : "border-input hover:bg-muted/50 text-card-foreground"
                )}
              >
                <Archive size={32} className="mb-2" />
                <span className="text-sm font-medium">Disposition</span>
              </button>
            </div>
          </div>

          {/* Show Card Sale Fields */}
          {transactionType === "show_card_sale" && (
            <>
              <div>
                <label htmlFor="show-card" className="form-label">Show Card *</label>
                <Select value={selectedCardId} onValueChange={handleCardSelection} disabled={loadingCards}>
                  <SelectTrigger className="mt-2 min-h-[44px]">
                    <SelectValue placeholder="Select a show card" />
                  </SelectTrigger>
                  <SelectContent>
                    {showCards?.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.player_name} ({card.year}) - ${card.asking_price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="revenue" className="form-label">Sale Amount *</label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="revenue"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    placeholder="0.00"
                    className="pl-8 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="transaction-date-sale" className="form-label">Transaction Date *</label>
                <Input
                  id="transaction-date-sale"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="mt-2 min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="show" className="form-label">Show (Optional)</label>
                <Select value={selectedShowId} onValueChange={setSelectedShowId} disabled={loadingShows}>
                  <SelectTrigger className="mt-2 min-h-[44px]">
                    <SelectValue placeholder="Select show (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No show</SelectItem>
                    {shows?.map((show) => (
                      <SelectItem key={show.id} value={show.id}>
                        {show.name} - {format(new Date(show.show_date), "MMM dd, yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="notes" className="form-label">Notes (Optional)</label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details about this sale..."
                  maxLength={500}
                  rows={3}
                  className="mt-2"
                />
              </div>
            </>
          )}

          {/* Bulk Sale Fields */}
          {transactionType === "bulk_sale" && (
            <>
              <div>
                <label htmlFor="lot" className="form-label">Lot *</label>
                <Select value={selectedLotId} onValueChange={setSelectedLotId} disabled={loadingLots}>
                  <SelectTrigger className="mt-2 min-h-[44px]">
                    <SelectValue placeholder="Select a lot" />
                  </SelectTrigger>
                  <SelectContent>
                    {lots?.map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.source} - ${lot.total_cost} ({format(new Date(lot.purchase_date), "MMM dd, yyyy")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="quantity" className="form-label">Number of Cards Sold *</label>
                <Input
                  id="quantity"
                  type="number"
                  step="1"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  className="mt-2 min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="bulk-revenue" className="form-label">Total Sale Amount *</label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="bulk-revenue"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    placeholder="0.00"
                    className="pl-8 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="transaction-date-bulk" className="form-label">Transaction Date *</label>
                <Input
                  id="transaction-date-bulk"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="mt-2 min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="bulk-show" className="form-label">Show (Optional)</label>
                <Select value={selectedShowId} onValueChange={setSelectedShowId} disabled={loadingShows}>
                  <SelectTrigger className="mt-2 min-h-[44px]">
                    <SelectValue placeholder="Select show (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No show</SelectItem>
                    {shows?.map((show) => (
                      <SelectItem key={show.id} value={show.id}>
                        {show.name} - {format(new Date(show.show_date), "MMM dd, yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="bulk-notes" className="form-label">Notes (Optional)</label>
                <Textarea
                  id="bulk-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details about this sale..."
                  maxLength={500}
                  rows={3}
                  className="mt-2"
                />
              </div>
            </>
          )}

          {/* Disposition Fields */}
          {transactionType === "disposition" && (
            <>
              <div>
                <label htmlFor="disposition-card" className="form-label">Show Card *</label>
                <Select value={selectedCardId} onValueChange={setSelectedCardId} disabled={loadingCards}>
                  <SelectTrigger className="mt-2 min-h-[44px]">
                    <SelectValue placeholder="Select a show card" />
                  </SelectTrigger>
                  <SelectContent>
                    {showCards?.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.player_name} ({card.year}) - ${card.asking_price}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="transaction-date-disposition" className="form-label">Transaction Date *</label>
                <Input
                  id="transaction-date-disposition"
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="mt-2 min-h-[44px]"
                />
              </div>

              <div>
                <label className="form-label mb-3 block">Disposition Type *</label>
                <RadioGroup value={dispositionType} onValueChange={(value) => setDispositionType(value as DispositionType)}>
                  <div className="flex items-center space-x-2 min-h-[44px]">
                    <RadioGroupItem value="discard" id="discard" />
                    <label htmlFor="discard" className="form-label cursor-pointer">Discard</label>
                  </div>
                  <div className="flex items-center space-x-2 min-h-[44px]">
                    <RadioGroupItem value="lost" id="lost" />
                    <label htmlFor="lost" className="form-label cursor-pointer">Lost</label>
                  </div>
                  <div className="flex items-center space-x-2 min-h-[44px]">
                    <RadioGroupItem value="combined" id="combined" />
                    <label htmlFor="combined" className="form-label cursor-pointer">Combined Into</label>
                  </div>
                </RadioGroup>
              </div>

              {dispositionType === "combined" && (
                <div>
                  <label htmlFor="destination-lot" className="form-label">Destination Lot *</label>
                  <Select value={destinationLotId} onValueChange={setDestinationLotId} disabled={loadingLots}>
                    <SelectTrigger className="mt-2 min-h-[44px]">
                      <SelectValue placeholder="Select destination lot" />
                    </SelectTrigger>
                    <SelectContent>
                      {lots?.map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>
                          {lot.source} - ${lot.total_cost} ({format(new Date(lot.purchase_date), "MMM dd, yyyy")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label htmlFor="disposition-notes" className="form-label">Notes (Optional)</label>
                <Textarea
                  id="disposition-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details..."
                  maxLength={500}
                  rows={3}
                  className="mt-2"
                />
              </div>
            </>
          )}

          {/* Submit Button - Fixed on mobile */}
          <div className="fixed md:relative bottom-20 md:bottom-0 left-0 right-0 p-4 md:p-0 bg-background md:bg-transparent">
            <Button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="w-full bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold uppercase min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : transactionType === "disposition" ? (
                "RECORD DISPOSITION"
              ) : (
                "RECORD SALE"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
