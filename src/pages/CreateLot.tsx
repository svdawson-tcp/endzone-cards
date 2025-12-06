import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { FormField } from "@/components/forms/FormField";
import { format } from "date-fns";
import { PageContainer } from "@/components/layout/AppLayout";
import { parseRequiredAmount } from "@/lib/numericUtils";

export default function CreateLot() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id } = useParams();
  const isEditMode = !!id;

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [purchaseDate, setPurchaseDate] = useState(todayStr);
  const [source, setSource] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: existingLot, isLoading: loadingLot } = useQuery({
    queryKey: ["lot", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (existingLot) {
      setPurchaseDate(existingLot.purchase_date);
      setSource(existingLot.source);
      setTotalCost(existingLot.total_cost.toString());
      setNotes(existingLot.notes || "");
    }
  }, [existingLot]);

  useEffect(() => {
    if (isEditMode && !loadingLot && !existingLot) {
      toast({
        title: "Error loading lot",
        description: "Lot not found",
        variant: "destructive",
      });
      navigate("/lots");
    }
  }, [isEditMode, loadingLot, existingLot, toast, navigate]);

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
      const todayStr = format(new Date(), "yyyy-MM-dd");
      if (purchaseDate > todayStr) {
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
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return (
      purchaseDate !== "" &&
      source.trim() !== "" &&
      totalCost !== "" &&
      parseFloat(totalCost) > 0 &&
      purchaseDate <= todayStr
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const lotData = {
        purchase_date: purchaseDate,
        source: source.trim(),
        total_cost: parseRequiredAmount(totalCost),
        notes: notes.trim() || null,
      };

      if (isEditMode) {
        const { error } = await supabase
          .from("lots")
          .update(lotData)
          .eq("id", id);

        if (error) throw error;

        toast({
          title: "Lot updated!",
          description: `${source} has been updated successfully`,
        });
      } else {
        const { data: lot, error: lotError } = await supabase
          .from("lots")
          .insert({
            ...lotData,
            user_id: user.id,
            status: "active",
          })
          .select()
          .single();

        if (lotError) throw lotError;

        toast({
          title: "Lot created!",
          description: `${source} - $${totalCost} recorded. Cash balance updated.`,
        });
      }

      navigate("/lots");
    } catch (error: any) {
      console.error(`${isEditMode ? "Update" : "Create"} lot error:`, error);
      toast({
        title: `Error ${isEditMode ? "updating" : "creating"} lot`,
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

  if (isEditMode && loadingLot) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading lot data...</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        <h1 className="page-title mb-2">{isEditMode ? "EDIT LOT" : "CREATE LOT"}</h1>
        <p className="text-muted-foreground">Record a new purchase</p>
      </div>

      {!isEditMode && (
        <Alert className="mb-6 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500">
          <Info className="h-5 w-5 text-blue-500" />
          <AlertDescription className="ml-2 text-blue-900 dark:text-blue-100">
            Lots are purchase containers. After creating a lot, you can add individual show
            cards to it for detailed tracking.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-4">
        <FormField
          label="Purchase Date"
          required
          error={errors.purchaseDate}
          htmlFor="purchase-date"
        >
          <DateInput
            id="purchase-date"
            value={purchaseDate}
            onChange={(e) => {
              setPurchaseDate(e.target.value);
              if (errors.purchaseDate) setErrors({ ...errors, purchaseDate: "" });
            }}
            max={format(new Date(), "yyyy-MM-dd")}
          />
        </FormField>

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
          <p className="text-xs text-gray-600 mt-1">
            Where did you buy this lot?
          </p>
          {errors.source && (
            <p className="text-destructive text-sm mt-1">{errors.source}</p>
          )}
        </div>

        <FormField
          label="Total Cost"
          required
          error={errors.totalCost}
          helperText="Total amount paid for this purchase"
          htmlFor="total-cost"
        >
          <CurrencyInput
            id="total-cost"
            value={totalCost}
            onChange={(e) => {
              setTotalCost(e.target.value);
              if (errors.totalCost) setErrors({ ...errors, totalCost: "" });
            }}
            placeholder="0.00"
            min={0.01}
            step={0.01}
          />
        </FormField>

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
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold uppercase min-h-[44px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditMode ? "Updating..." : "Creating..."}
              </>
            ) : (
              isEditMode ? "UPDATE LOT" : "CREATE LOT"
            )}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
