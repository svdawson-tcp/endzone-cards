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
import { DollarSign, Calendar, FileText, Loader2, Package, Hash, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageContainer } from "@/components/layout/AppLayout";
import { parseRequiredAmount } from "@/lib/numericUtils";

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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: lots = [], isLoading: lotsLoading } = useQuery({
    queryKey: ["active-lots"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("status", "active")
        .order("purchase_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: shows = [], isLoading: showsLoading } = useQuery({
    queryKey: ["active-planned-shows"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("user_id", user.user.id)
        .in("status", ["active", "planned"])
        .order("show_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const transactionData = {
        user_id: user.user.id,
        transaction_type: "bulk_sale",
        lot_id: selectedLotId,
        quantity: parseInt(quantity),
        revenue: parseRequiredAmount(revenue),
        show_id: selectedShowId || null,
        transaction_date: saleDate,
        notes: notes.trim() || null,
      };

      const { data, error } = await supabase
        .from("transactions")
        .insert(transactionData)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["active-lots"] });

      toast({
        title: "Bulk sale recorded",
        description: "Transaction has been saved successfully",
      });

      navigate("/lots");
    },
    onError: (error: any) => {
      toast({
        title: "Error recording bulk sale",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const newErrors: Record<string, string> = {};

    if (!selectedLotId) newErrors.lot = "Please select a lot";
    if (!quantity || parseInt(quantity) <= 0) newErrors.quantity = "Please enter a valid quantity";
    if (!revenue || parseFloat(revenue) <= 0) newErrors.revenue = "Please enter valid revenue";
    if (!saleDate) newErrors.date = "Please select a date";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields correctly",
        variant: "destructive",
      });
      return;
    }
    
    // Submit transaction
    submitMutation.mutate();
  };

  return (
    <PageContainer maxWidth="2xl">
      <div className="bg-card shadow-card-shadow rounded-lg p-6 md:p-8">
      {/* Header */}
      <h1 className="text-h1 mb-2">RECORD BULK SALE</h1>
      <p className="text-gray-600 mb-6">Record sale of common cards from inventory</p>

      {/* Informational Alert */}
      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Recording bulk sales for multiple lots? Record each lot sale separately to maintain accurate per-lot profit tracking.
        </AlertDescription>
      </Alert>

      {/* Bulk Sale Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Primary Lot Selection */}
        <div>
          <label htmlFor="lot-select" className="form-label">Primary Lot *</label>
          <Select
            value={selectedLotId}
            onValueChange={(value) => {
              setSelectedLotId(value);
              setErrors((prev) => ({ ...prev, lot: "" }));
            }}
            disabled={lotsLoading}
          >
            <SelectTrigger className={`w-full min-h-[44px] ${errors.lot ? "border-red-500" : ""}`}>
              <SelectValue placeholder={lotsLoading ? "Loading lots..." : "Select lot"} />
            </SelectTrigger>
            <SelectContent>
              {lots.map((lot) => (
                <SelectItem key={lot.id} value={lot.id}>
                  {format(new Date(lot.purchase_date), "MMM d, yyyy")} - {lot.source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.lot && <p className="text-sm text-red-500 mt-1">{errors.lot}</p>}
        </div>

        {/* Quantity */}
        <div>
          <label htmlFor="quantity" className="form-label">Quantity Sold *</label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
            <Input
              id="quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setErrors((prev) => ({ ...prev, quantity: "" }));
              }}
              placeholder="Enter number of cards sold"
              className={`pl-10 min-h-[44px] ${errors.quantity ? "border-red-500" : ""}`}
            />
          </div>
          {errors.quantity && <p className="text-sm text-red-500 mt-1">{errors.quantity}</p>}
        </div>

        {/* Revenue */}
        <div>
          <label htmlFor="revenue" className="form-label">Total Revenue *</label>
          <CurrencyInput
            id="revenue"
            value={revenue}
            onChange={(e) => {
              setRevenue(e.target.value);
              setErrors((prev) => ({ ...prev, revenue: "" }));
            }}
            placeholder="0.00"
            className={errors.revenue ? "border-red-500" : ""}
          />
          {errors.revenue && <p className="text-sm text-red-500 mt-1">{errors.revenue}</p>}
        </div>

        {/* Show Selection (Optional) */}
        <div>
          <label htmlFor="show-select" className="form-label">Show (Optional)</label>
          <Select
            value={selectedShowId || "none"}
            onValueChange={(value) => setSelectedShowId(value === "none" ? "" : value)}
            disabled={showsLoading}
          >
            <SelectTrigger className="w-full min-h-[44px]">
              <SelectValue placeholder={showsLoading ? "Loading shows..." : "Select show (optional)"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No show</SelectItem>
              {shows.map((show) => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name} - {format(new Date(show.show_date), "MMM d, yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sale Date */}
        <div>
          <label htmlFor="sale-date" className="form-label">Sale Date *</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
            <Input
              id="sale-date"
              type="date"
              value={saleDate}
              onChange={(e) => {
                setSaleDate(e.target.value);
                setErrors((prev) => ({ ...prev, date: "" }));
              }}
              max={format(new Date(), "yyyy-MM-dd")}
              className={`pl-10 min-h-[44px] ${errors.date ? "border-red-500" : ""}`}
            />
          </div>
          {errors.date && <p className="text-sm text-red-500 mt-1">{errors.date}</p>}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="form-label">Notes (Optional)</label>
          <div className="relative">
            <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes..."
              className="pl-10 min-h-[100px]"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/lots")}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitMutation.isPending}
            className="flex-1 bg-[#041E42] hover:bg-[#0A2E63] text-white"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
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
    </PageContainer>
  );
}
