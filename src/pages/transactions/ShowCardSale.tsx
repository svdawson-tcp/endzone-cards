import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { format } from "date-fns";
import { DollarSign, Calendar, FileText, Loader2, Package, Image as ImageIcon } from "lucide-react";

interface ShowCard {
  id: string;
  player_name: string;
  year: string | null;
  photo_front_url: string | null;
  asking_price: number | null;
  lot_id: string;
  lots?: {
    source: string;
  } | null;
}

export default function ShowCardSale() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [salePrice, setSalePrice] = useState<string>("");
  const [selectedShowId, setSelectedShowId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState<string>("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [errors, setErrors] = useState<{ salePrice?: string; show?: string }>({});

  // Get card from route state or fetch by ID
  const passedCard = location.state?.showCard as ShowCard | undefined;

  const { data: fetchedCard, isLoading: loadingCard } = useQuery({
    queryKey: ["show_card", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("show_cards")
        .select("*, lots!lot_id(source)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as ShowCard;
    },
    enabled: !passedCard && !!id,
  });

  const showCard = passedCard || fetchedCard;

  // Auto-fill sale price with asking price
  useEffect(() => {
    if (showCard?.asking_price && !salePrice) {
      setSalePrice(showCard.asking_price.toString());
    }
  }, [showCard, salePrice]);

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

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!showCard) throw new Error("Show card not found");

      const salePriceNum = salePrice as any;

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not authenticated");

      // Insert transaction
      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          transaction_type: "show_card_sale",
          show_card_id: showCard.id,
          lot_id: showCard.lot_id,
          show_id: selectedShowId || null,
          revenue: salePriceNum,
          quantity: 1,
          notes: notes || null,
          transaction_date: saleDate,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Update show card (trigger will set status to 'sold')
      // If no asking price, set it to sale price
      if (showCard.asking_price === null) {
        const { error: updateError } = await supabase
          .from("show_cards")
          .update({ asking_price: salePriceNum })
          .eq("id", showCard.id);
        
        if (updateError) throw updateError;
      }

      return transaction;
    },
    onSuccess: () => {
      toast({
        title: "Sale recorded!",
        description: `${showCard?.player_name} sold successfully.`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["show_cards"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      
      navigate("/show-cards");
    },
    onError: (error: any) => {
      toast({
        title: "Error recording sale",
        description: error.message || "Failed to record sale. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    
    const salePriceNum = parseFloat(salePrice);
    const validationErrors: { salePrice?: string; show?: string } = {};
    
    // VALIDATE FIRST - before any dialogs
    if (!salePriceNum || salePriceNum <= 0) {
      validationErrors.salePrice = "Sale price must be greater than 0";
    }
    
    // If validation errors exist, show them and stop
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    // THEN check price difference
    if (showCard?.asking_price && showCard.asking_price !== salePriceNum) {
      setShowConfirmDialog(true);
      return;
    }
    
    // If no price difference, submit directly
    submitMutation.mutate();
  };

  const handleConfirmSubmit = () => {
    setShowConfirmDialog(false);
    submitMutation.mutate();
  };

  if (loadingCard) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!showCard) {
    toast({
      title: "Card not found",
      description: "The show card you're looking for doesn't exist.",
      variant: "destructive",
    });
    navigate("/show-cards");
    return null;
  }

  return (
    <div className="bg-background pb-32 md:pb-8">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card shadow-card-shadow rounded-lg p-6 md:p-8">
        {/* Header */}
        <h1 className="text-h1 mb-2">RECORD SALE</h1>
        <p className="text-gray-600 mb-6">Complete the sale transaction</p>

        {/* Show Card Preview */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Show Card</h2>
          <div className="flex gap-4">
            {/* Card Photo */}
            <div className="w-20 h-28 bg-gray-200 rounded overflow-hidden flex-shrink-0">
              {showCard.photo_front_url ? (
                <img 
                  src={showCard.photo_front_url} 
                  alt={showCard.player_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-gray-400" />
                </div>
              )}
            </div>

            {/* Card Details */}
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-lg">
                {showCard.player_name} {showCard.year && `(${showCard.year})`}
              </h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Package className="h-4 w-4" />
                <span>From: {showCard.lots?.source || "Unknown Lot"}</span>
              </div>
              {showCard.asking_price !== null && (
                <div className="flex items-center gap-2 text-sm text-gray-900 mt-2">
                  <DollarSign className="h-4 w-4" />
                  <span className="font-semibold">Asking: ${showCard.asking_price.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sale Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sale Price */}
          <div>
            <label htmlFor="sale-price" className="form-label">Sale Price *</label>
            <CurrencyInput
              id="sale-price"
              value={salePrice}
              onChange={(e) => {
                setSalePrice(e.target.value);
                if (errors.salePrice) setErrors({ ...errors, salePrice: "" });
              }}
              placeholder="0.00"
              required
              min={0.01}
              step={0.01}
              autoFocus
              className="mt-2"
            />
            <p className="text-xs text-gray-400 mt-1">
              Final sale price for this card
            </p>
            {errors.salePrice && (
              <p className="text-destructive text-sm mt-1">{errors.salePrice}</p>
            )}
          </div>

          {/* Show Selection */}
          <div>
            <label htmlFor="show-select" className="form-label">Show (Optional)</label>
            <Select
              value={selectedShowId}
              onValueChange={(value) => {
                setSelectedShowId(value);
                if (errors.show) setErrors({ ...errors, show: "" });
              }}
            >
              <SelectTrigger 
                id="show-select" 
                className="mt-2 min-h-[44px] bg-white text-gray-900"
              >
                <SelectValue placeholder="Select show where sold" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {loadingShows ? (
                  <SelectItem value="loading" disabled className="text-gray-900">Loading shows...</SelectItem>
                ) : shows && shows.length > 0 ? (
                  shows.map((show) => (
                    <SelectItem key={show.id} value={show.id} className="text-gray-900">
                      {show.name} - {format(new Date(show.show_date), "MMM dd, yyyy")}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled className="text-gray-900">No shows available</SelectItem>
                )}
              </SelectContent>
            </Select>
            {errors.show && (
              <p className="text-destructive text-sm mt-1">{errors.show}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Select show if sold at an event, leave blank for online/personal sales
            </p>
          </div>

          {/* Sale Date */}
          <div>
            <label htmlFor="sale-date" className="form-label">Sale Date *</label>
            <div className="relative mt-2">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="sale-date"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={format(new Date(), "yyyy-MM-dd")}
                className="pl-10 min-h-[44px] bg-white text-gray-900"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="form-label">Notes (Optional)</label>
            <div className="relative mt-2">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional sale details..."
                maxLength={500}
                rows={3}
                className="pl-10 bg-white text-gray-900 placeholder:text-gray-500 resize-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {notes.length}/500 characters
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/show-cards")}
              disabled={submitMutation.isPending}
              className="flex-1 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMutation.isPending}
              className="flex-1 min-h-[44px] bg-[#041E42] hover:bg-[#0A2E63] text-white"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording Sale...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  RECORD SALE
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Price Difference Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sale Price Differs from Asking Price</AlertDialogTitle>
            <AlertDialogDescription>
              The sale price (${parseFloat(salePrice || "0").toFixed(2)}) is different from the 
              asking price (${showCard.asking_price?.toFixed(2) || "0.00"}). 
              Do you want to continue with this sale?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSubmit}
              className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]"
            >
              Confirm Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
