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
import { PageContainer } from "@/components/layout/AppLayout";

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

  const getNotesPlaceholder = () => {
    switch (dispositionType) {
      case "discarded":
        return "e.g., Damaged cards thrown away";
      case "lost":
        return "e.g., Misplaced during inventory count";
      case "combined":
        return "e.g., Merged remaining cards into active lot";
      default:
        return "Add any notes about this disposition...";
    }
  };

  useEffect(() => {
    if (dispositionType !== "combined") {
      setDestinationLotId("");
    }
  }, [dispositionType]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      let dispositionNotes = notes;
      if (dispositionType === "combined" && destinationLotId) {
        const destLot = lots.find(l => l.id === destinationLotId);
        if (destLot) {
          dispositionNotes = `${notes ? notes + " | " : ""}Combined into lot from ${destLot.source} (${format(new Date(destLot.purchase_date), "MMM d, yyyy")})`;
        }
      }

      const transactionData = {
        user_id: user.user.id,
        transaction_type: dispositionType,
        lot_id: selectedLotId,
        quantity: parseInt(quantity),
        revenue: 0,
        transaction_date: transactionDate,
        notes: dispositionNotes || null,
      };

      const { error } = await supabase
        .from("transactions")
        .insert(transactionData);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["active-lots"] });

      toast({
        title: "Disposition recorded",
        description: `${quantity} cards marked as ${dispositionType}`,
      });

      navigate("/lots");
    },
    onError: (error: any) => {
      toast({
        title: "Error recording disposition",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!selectedLotId) newErrors.lot = "Please select a lot";
    if (!dispositionType) newErrors.dispositionType = "Please select a disposition type";
    if (!quantity || parseInt(quantity) <= 0) newErrors.quantity = "Please enter a valid quantity";
    if (dispositionType === "combined" && !destinationLotId) {
      newErrors.destinationLot = "Please select a destination lot";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    submitMutation.mutate();
  };

  return (
    <PageContainer maxWidth="2xl">
      <div className="bg-card shadow-card-shadow rounded-lg p-6 md:p-8">
        <h1 className="text-h1 mb-2">RECORD DISPOSITION</h1>
        <p className="text-gray-600 mb-6">Mark cards as discarded, lost, or combined</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="lot-select" className="form-label">From Lot *</label>
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

          <div>
            <label htmlFor="transaction-date" className="form-label">Transaction Date *</label>
            <Input
              id="transaction-date"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              max={format(new Date(), "yyyy-MM-dd")}
              className="min-h-[44px]"
            />
          </div>

          <div>
            <label className="form-label">Disposition Type *</label>
            <RadioGroup
              value={dispositionType}
              onValueChange={(value) => {
                setDispositionType(value as DispositionType);
                setErrors((prev) => ({ ...prev, dispositionType: "" }));
              }}
              className="space-y-3 mt-2"
            >
              <div className={`flex items-center space-x-3 p-4 border rounded-lg ${dispositionType === "discarded" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="discarded" id="discarded" />
                <Label htmlFor="discarded" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    <span className="font-medium">Discarded</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cards thrown away or destroyed
                  </p>
                </Label>
              </div>

              <div className={`flex items-center space-x-3 p-4 border rounded-lg ${dispositionType === "lost" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="lost" id="lost" />
                <Label htmlFor="lost" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Lost</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cards misplaced or unaccounted for
                  </p>
                </Label>
              </div>

              <div className={`flex items-center space-x-3 p-4 border rounded-lg ${dispositionType === "combined" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="combined" id="combined" />
                <Label htmlFor="combined" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    <span className="font-medium">Combined</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cards merged into another active lot
                  </p>
                </Label>
              </div>
            </RadioGroup>
            {errors.dispositionType && <p className="text-sm text-red-500 mt-1">{errors.dispositionType}</p>}
          </div>

          <div>
            <label htmlFor="quantity" className="form-label">Quantity *</label>
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
                placeholder="Enter number of cards"
                className={`pl-10 min-h-[44px] ${errors.quantity ? "border-red-500" : ""}`}
              />
            </div>
            {errors.quantity && <p className="text-sm text-red-500 mt-1">{errors.quantity}</p>}
          </div>

          {dispositionType === "combined" && (
            <div>
              <label htmlFor="destination-lot" className="form-label">Destination Lot *</label>
              <Select
                value={destinationLotId}
                onValueChange={(value) => {
                  setDestinationLotId(value);
                  setErrors((prev) => ({ ...prev, destinationLot: "" }));
                }}
                disabled={lotsLoading}
              >
                <SelectTrigger className={`w-full min-h-[44px] ${errors.destinationLot ? "border-red-500" : ""}`}>
                  <SelectValue placeholder="Select destination lot" />
                </SelectTrigger>
                <SelectContent>
                  {lots.filter(lot => lot.id !== selectedLotId).map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {format(new Date(lot.purchase_date), "MMM d, yyyy")} - {lot.source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600 mt-1">
                Select the lot these cards will be merged into
              </p>
              {errors.destinationLot && <p className="text-sm text-red-500 mt-1">{errors.destinationLot}</p>}
            </div>
          )}

          <div>
            <label htmlFor="notes" className="form-label">Notes (Optional)</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={getNotesPlaceholder()}
                className="pl-10 min-h-[100px]"
              />
            </div>
          </div>

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
                  <Trash2 className="mr-2 h-4 w-4" />
                  RECORD DISPOSITION
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
