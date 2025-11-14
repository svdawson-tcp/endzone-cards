import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { format } from "date-fns";
import { DollarSign, Calendar, FileText, Loader2, Package, Hash } from "lucide-react";

export default function BulkSale() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [revenue, setRevenue] = useState<string>("");
  const [selectedShowId, setSelectedShowId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState<string>("");
  const [errors, setErrors] = useState<{ 
    lot?: string; 
    quantity?: string; 
    revenue?: string; 
    show?: string;
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

  // Fetch active/planned shows
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
      const quantityNum = parseInt(quantity);
      const revenueNum = parseFloat(revenue);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not authenticated");

      // Insert transaction
      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          transaction_type: "bulk_sale",
          lot_id: selectedLotId,
          show_id: selectedShowId || null,
          quantity: quantityNum,
          revenue: revenueNum,
          notes: notes || null,
          transaction_date: saleDate,
        })
        .select()
        .single();

      if (txError) throw txError;

      return transaction;
    },
    onSuccess: () => {
      toast({
        title: "Bulk sale recorded!",
        description: "The sale has been successfully recorded.",
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["cash_transactions"] });
      
      navigate("/lots");
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
    
    const quantityNum = parseInt(quantity);
    const revenueNum = parseFloat(revenue);
    const validationErrors: { 
      lot?: string; 
      quantity?: string; 
      revenue?: string; 
      show?: string;
    } = {};
    
    // VALIDATE ALL REQUIRED FIELDS
    if (!selectedLotId) {
      validationErrors.lot = "Lot selection is required";
    }
    if (!quantityNum || quantityNum < 1) {
      validationErrors.quantity = "Quantity must be at least 1";
    }
    if (!revenueNum || revenueNum <= 0) {
      validationErrors.revenue = "Revenue must be greater than 0";
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
    <div className="container max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
        {/* Header */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">RECORD BULK SALE</h1>
        <p className="text-muted-foreground mb-6">Record sale of common cards from inventory</p>

        {/* Bulk Sale Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Primary Lot Selection */}
          <div>
            <label htmlFor="lot-select" className="form-label">Primary Lot *</label>
            <Select
              value={selectedLotId}
              onValueChange={(value) => {
                setSelectedLotId(value);
                if (errors.lot) setErrors({ ...errors, lot: "" });
              }}
            >
              <SelectTrigger 
                id="lot-select" 
                className="mt-2 min-h-[44px] bg-white text-card-foreground"
              >
                <SelectValue placeholder="Select lot for bulk sale" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {loadingLots ? (
                  <SelectItem value="loading" disabled>Loading lots...</SelectItem>
                ) : lots && lots.length > 0 ? (
                  lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.source} - {format(new Date(lot.purchase_date), "MMM dd, yyyy")}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No active lots available</SelectItem>
                )}
              </SelectContent>
            </Select>
            {errors.lot && (
              <p className="text-destructive text-sm mt-1">{errors.lot}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Which lot are most of these cards from?
            </p>
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
                placeholder="10"
                required
                min={1}
                step={1}
                autoFocus
                className="pl-10 min-h-[44px] bg-white text-card-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total number of cards sold
            </p>
            {errors.quantity && (
              <p className="text-destructive text-sm mt-1">{errors.quantity}</p>
            )}
          </div>

          {/* Revenue */}
          <div>
            <label htmlFor="revenue" className="form-label">Revenue *</label>
            <CurrencyInput
              id="revenue"
              value={revenue}
              onChange={(e) => {
                setRevenue(e.target.value);
                if (errors.revenue) setErrors({ ...errors, revenue: "" });
              }}
              placeholder="50.00"
              required
              min={0.01}
              step={0.01}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Total revenue from this bulk sale
            </p>
            {errors.revenue && (
              <p className="text-destructive text-sm mt-1">{errors.revenue}</p>
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
                className="mt-2 min-h-[44px] bg-white text-card-foreground"
              >
                <SelectValue placeholder="Select show where sold" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {loadingShows ? (
                  <SelectItem value="loading" disabled>Loading shows...</SelectItem>
                ) : shows && shows.length > 0 ? (
                  shows.map((show) => (
                    <SelectItem key={show.id} value={show.id}>
                      {show.name} - {format(new Date(show.show_date), "MMM dd, yyyy")}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No shows available</SelectItem>
                )}
              </SelectContent>
            </Select>
            {errors.show && (
              <p className="text-destructive text-sm mt-1">{errors.show}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
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
                className="pl-10 min-h-[44px] bg-white text-card-foreground"
              />
            </div>
          </div>

          {/* Notes - Prominent for multi-lot tracking */}
          <div>
            <label htmlFor="notes" className="form-label">Notes (Multi-Lot Documentation)</label>
            <div className="relative mt-2">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Also included 15 cards from Lot #457, 10 from Lot #458"
                maxLength={500}
                rows={4}
                className="pl-10 bg-white text-card-foreground placeholder:opacity-50 resize-none"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Document cards from multiple lots for accurate tracking • {notes.length}/500 characters
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
              className="flex-1 min-h-[44px] bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
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
    </div>
  );
}
