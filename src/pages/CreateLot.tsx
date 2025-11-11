import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";

export default function CreateLot() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Default to today
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [purchaseDate, setPurchaseDate] = useState(todayStr);
  const [source, setSource] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errors, setErrors] = useState({
    purchaseDate: "",
    source: "",
    totalCost: "",
  });

  const validateForm = () => {
    const newErrors = {
      purchaseDate: "",
      source: "",
      totalCost: "",
    };

    let isValid = true;

    if (!purchaseDate) {
      newErrors.purchaseDate = "Purchase date is required";
      isValid = false;
    } else {
      const selectedDate = new Date(purchaseDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (selectedDate > today) {
        newErrors.purchaseDate = "Date cannot be in the future";
        isValid = false;
      }
    }

    if (!source.trim()) {
      newErrors.source = "Source is required";
      isValid = false;
    }

    if (!totalCost || parseFloat(totalCost) <= 0) {
      newErrors.totalCost = "Total cost must be greater than 0";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const isFormValid = () => {
    return (
      purchaseDate !== "" &&
      source.trim() !== "" &&
      totalCost !== "" &&
      parseFloat(totalCost) > 0 &&
      new Date(purchaseDate) <= new Date(new Date().setHours(23, 59, 59, 999))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Insert lot
      const { data: lot, error: lotError } = await supabase
        .from("lots")
        .insert({
          user_id: user.id,
          purchase_date: purchaseDate,
          source: source.trim(),
          total_cost: parseFloat(totalCost),
          status: "active",
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (lotError) throw lotError;

      // Database trigger automatically creates cash_transaction for purchase

      toast({
        title: "Lot created!",
        description: `${source} - $${totalCost} recorded. Cash balance updated.`,
      });

      navigate("/lots");
    } catch (error: any) {
      console.error("Create lot error:", error);
      toast({
        title: "Error creating lot",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate("/lots");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-h1 mb-2">CREATE LOT</h1>
          <p className="text-muted-foreground">Record a new purchase</p>
        </div>

        {/* Info Callout */}
        <Alert className="mb-6 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500">
          <Info className="h-5 w-5 text-blue-500" />
          <AlertDescription className="ml-2 text-blue-900 dark:text-blue-100">
            Lots are purchase containers. After creating a lot, you can add individual show
            cards to it for detailed tracking.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-4">
          {/* Purchase Date */}
          <div>
            <label htmlFor="purchase-date" className="form-label">Purchase Date *</label>
            <Input
              id="purchase-date"
              type="date"
              value={purchaseDate}
              onChange={(e) => {
                setPurchaseDate(e.target.value);
                if (errors.purchaseDate) setErrors({ ...errors, purchaseDate: "" });
              }}
              max={format(new Date(), "yyyy-MM-dd")}
              className="mt-2 min-h-[44px]"
            />
            {errors.purchaseDate && (
              <p className="text-destructive text-sm mt-1">{errors.purchaseDate}</p>
            )}
          </div>

          {/* Source */}
          <div>
            <label htmlFor="source" className="form-label">Source *</label>
            <Input
              id="source"
              type="text"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                if (errors.source) setErrors({ ...errors, source: "" });
              }}
              placeholder="eBay, Facebook Marketplace, Local Store, etc."
              maxLength={100}
              className="mt-2 min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Where did you buy this lot?
            </p>
            {errors.source && (
              <p className="text-destructive text-sm mt-1">{errors.source}</p>
            )}
          </div>

          {/* Total Cost */}
          <div>
            <label htmlFor="total-cost" className="form-label">Total Cost *</label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="total-cost"
                type="number"
                step="0.01"
                min="0.01"
                value={totalCost}
                onChange={(e) => {
                  setTotalCost(e.target.value);
                  if (errors.totalCost) setErrors({ ...errors, totalCost: "" });
                }}
                placeholder="0.00"
                className="pl-8 min-h-[44px]"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total amount paid for this purchase
            </p>
            {errors.totalCost && (
              <p className="text-destructive text-sm mt-1">{errors.totalCost}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="form-label">Notes (Optional)</label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details about the purchase, what's included, condition notes..."
              maxLength={500}
              rows={4}
              className="mt-2"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              onClick={handleCancel}
              variant="outline"
              className="flex-1 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid() || isSubmitting}
              className="flex-1 bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold uppercase min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "CREATE LOT"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
