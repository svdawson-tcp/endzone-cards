import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Trash2, Loader2, Package, Hash, FileText, AlertCircle } from "lucide-react";

type DispositionType = "discarded" | "lost" | "combined";

export default function Disposition() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [dispositionType, setDispositionType] = useState<DispositionType | "">("");
  const [quantity, setQuantity] = useState<string>("");
  const [destinationLotId, setDestinationLotId] = useState<string>("");
  const [transactionDate, setTransactionDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState<string>("");
  const [errors, setErrors] = useState<{ 
    lot?: string; 
    type?: string;
    quantity?: string; 
    destinationLot?: string;
  }>({});

  // Fetch active lots
  const { data: lots, isLoading: loadingLots } = useQuery({
    queryKey: ["active-lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, source, purchase_date")
        .eq("status", "active")
        .order("purchase_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Get placeholder text based on disposition type
  const getNotesPlaceholder = () => {
    switch (dispositionType) {
      case "discarded":
        return "e.g., Water damaged, unsellable condition";
      case "lost":
        return "e.g., Missing after show, possible theft";
      case "combined":
        return "e.g., Consolidating similar cards for easier management";
      default:
        return "Additional details about this disposition...";
    }
  };

  // Clear destination lot when type changes
  useEffect(() => {
    if (dispositionType !== "combined") {
      setDestinationLotId("");
    }
  }, [dispositionType]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const quantityNum = parseInt(quantity);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not authenticated");

      // Build notes with destination lot info if combined
      let finalNotes = notes;
      if (dispositionType === "combined" && destinationLotId) {
        const destLot = lots?.find(l => l.id === destinationLotId);
        const destInfo = `Combined into lot: ${destLot?.source || destinationLotId}`;
        finalNotes = notes ? `${destInfo}\n${notes}` : destInfo;
      }

      // Insert transaction
      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          transaction_type: "disposition",
          lot_id: selectedLotId,
          quantity: quantityNum,
          revenue: 0,
          notes: finalNotes || `Disposition: ${dispositionType}`,
          transaction_date: transactionDate,
        })
        .select()
        .single();

      if (txError) throw txError;

      return transaction;
    },
    onSuccess: () => {
      const typeLabel = dispositionType === "discarded" ? "Discarded" 
        : dispositionType === "lost" ? "Lost" 
        : "Combined";
      
      toast({
        title: "Disposition recorded!",
        description: `${quantity} card(s) marked as ${typeLabel.toLowerCase()}.`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      
      navigate("/lots");
    },
    onError: (error: any) => {
      toast({
        title: "Error recording disposition",
        description: error.message || "Failed to record disposition. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    
    const quantityNum = parseInt(quantity);
    const validationErrors: { 
      lot?: string; 
      type?: string;
      quantity?: string; 
      destinationLot?: string;
    } = {};
    
    // VALIDATE ALL REQUIRED FIELDS
    if (!selectedLotId) {
      validationErrors.lot = "Lot selection is required";
    }
    if (!dispositionType) {
      validationErrors.type = "Disposition type is required";
    }
    if (!quantityNum || quantityNum < 1) {
      validationErrors.quantity = "Quantity must be at least 1";
    }
    if (dispositionType === "combined" && !destinationLotId) {
      validationErrors.destinationLot = "Destination lot is required for combined disposition";
    }
    
    // If validation errors exist, show them and stop
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    // Submit transaction
    submitMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-8">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card shadow-card-shadow rounded-lg p-6 md:p-8">
        {/* Header */}
        <h1 className="text-h1 mb-2">RECORD DISPOSITION</h1>
        <p className="text-gray-600 mb-6">Mark cards as discarded, lost, or combined</p>

        {/* Disposition Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* From Lot Selection */}
          <div>
            <label htmlFor="lot-select" className="form-label">From Lot *</label>
            <Select
              value={selectedLotId}
              onValueChange={(value) => {
                setSelectedLotId(value);
                if (errors.lot) setErrors({ ...errors, lot: "" });
              }}
            >
              <SelectTrigger 
                id="lot-select" 
                className="mt-2 min-h-[44px] bg-white text-gray-900"
              >
                <SelectValue placeholder="Select lot for disposition" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {loadingLots ? (
                  <SelectItem value="loading" disabled className="text-gray-900">Loading lots...</SelectItem>
                ) : lots && lots.length > 0 ? (
                  lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id} className="text-gray-900">
                      {lot.source} - {format(new Date(lot.purchase_date), "MMM dd, yyyy")}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled className="text-gray-900">No active lots available</SelectItem>
                )}
              </SelectContent>
            </Select>
            {errors.lot && (
              <p className="text-destructive text-sm mt-1">{errors.lot}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Which lot are these cards from?
            </p>
          </div>

          {/* Transaction Date */}
          <div>
            <label htmlFor="transaction-date" className="form-label">Transaction Date *</label>
            <Input
              id="transaction-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              max={format(new Date(), "yyyy-MM-dd")}
              className="mt-2 min-h-[44px] bg-white text-gray-900"
            />
            <p className="text-xs text-gray-400 mt-1">
              Date when this disposition occurred
            </p>
          </div>

          {/* Disposition Type */}
          <div>
            <label className="form-label">Disposition Type *</label>
            <RadioGroup 
              value={dispositionType} 
              onValueChange={(value: DispositionType) => {
                setDispositionType(value);
                if (errors.type) setErrors({ ...errors, type: "" });
              }}
              className="mt-3 space-y-3"
            >
              <div className="flex items-start space-x-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#041E42] transition-colors cursor-pointer has-[:checked]:border-[#041E42] has-[:checked]:bg-blue-50">
                <RadioGroupItem value="discarded" id="discarded" className="mt-1" />
                <Label htmlFor="discarded" className="flex-1 cursor-pointer">
                  <div className="font-semibold text-gray-900">Discarded</div>
                  <div className="text-sm text-muted-foreground">Intentionally thrown away (damaged, worthless)</div>
                </Label>
              </div>

              <div className="flex items-start space-x-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#041E42] transition-colors cursor-pointer has-[:checked]:border-[#041E42] has-[:checked]:bg-blue-50">
                <RadioGroupItem value="lost" id="lost" className="mt-1" />
                <Label htmlFor="lost" className="flex-1 cursor-pointer">
                  <div className="font-semibold text-gray-900">Lost</div>
                  <div className="text-sm text-muted-foreground">Unintentionally missing (theft, misplaced)</div>
                </Label>
              </div>

              <div className="flex items-start space-x-3 p-4 border-2 border-gray-200 rounded-lg hover:border-[#041E42] transition-colors cursor-pointer has-[:checked]:border-[#041E42] has-[:checked]:bg-blue-50">
                <RadioGroupItem value="combined" id="combined" className="mt-1" />
                <Label htmlFor="combined" className="flex-1 cursor-pointer">
                  <div className="font-semibold text-gray-900">Combined</div>
                  <div className="text-sm text-muted-foreground">Moved to another lot for organization</div>
                </Label>
              </div>
            </RadioGroup>
            {errors.type && (
              <p className="text-destructive text-sm mt-1">{errors.type}</p>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label htmlFor="quantity" className="form-label">Quantity *</label>
            <div className="relative mt-2">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="quantity"
                type="number"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (errors.quantity) setErrors({ ...errors, quantity: "" });
                }}
                placeholder="5"
                required
                min={1}
                step={1}
                className="pl-10 min-h-[44px] bg-white text-gray-900"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Number of cards in this disposition
            </p>
            {errors.quantity && (
              <p className="text-destructive text-sm mt-1">{errors.quantity}</p>
            )}
          </div>

          {/* Destination Lot - Conditional */}
          {dispositionType === "combined" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-gray-900">Destination Required</p>
                  <p className="text-sm text-muted-foreground">Select where these cards are being moved to</p>
                </div>
              </div>
              
              <label htmlFor="destination-lot" className="form-label">Destination Lot *</label>
              <Select
                value={destinationLotId}
                onValueChange={(value) => {
                  setDestinationLotId(value);
                  if (errors.destinationLot) setErrors({ ...errors, destinationLot: "" });
                }}
              >
                <SelectTrigger 
                  id="destination-lot" 
                  className="mt-2 min-h-[44px] bg-white text-gray-900"
                >
                  <SelectValue placeholder="Select destination lot" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  {loadingLots ? (
                    <SelectItem value="loading" disabled className="text-gray-900">Loading lots...</SelectItem>
                  ) : lots && lots.length > 0 ? (
                    lots
                      .filter(lot => lot.id !== selectedLotId) // Exclude source lot
                      .map((lot) => (
                        <SelectItem key={lot.id} value={lot.id} className="text-gray-900">
                          {lot.source} - {format(new Date(lot.purchase_date), "MMM dd, yyyy")}
                        </SelectItem>
                      ))
                  ) : (
                    <SelectItem value="none" disabled className="text-gray-900">No other lots available</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.destinationLot && (
                <p className="text-destructive text-sm mt-1">{errors.destinationLot}</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="form-label">Notes (Optional)</label>
            <div className="relative mt-2">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={getNotesPlaceholder()}
                maxLength={500}
                rows={4}
                className="pl-10 bg-white text-gray-900 placeholder:text-gray-500 resize-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Additional context for this disposition • {notes.length}/500 characters
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/lots")}
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
                  Recording...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  RECORD DISPOSITION
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
