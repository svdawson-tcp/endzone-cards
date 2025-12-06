import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { format } from "date-fns";
import { PageContainer } from "@/components/layout/AppLayout";
import { parseRequiredAmount } from "@/lib/numericUtils";

export default function CreateShow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id } = useParams();
  const isEditMode = !!id;

  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  const defaultDateStr = format(defaultDate, "yyyy-MM-dd");

  const [showName, setShowName] = useState("");
  const [showDate, setShowDate] = useState(defaultDateStr);
  const [location, setLocation] = useState("");
  const [tableCost, setTableCost] = useState("");
  const [boothNumber, setBoothNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [showStatus, setShowStatus] = useState<"planned" | "active" | "completed">("planned");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: existingShow, isLoading: loadingShow } = useQuery({
    queryKey: ["show", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (existingShow) {
      setShowName(existingShow.name);
      setShowDate(existingShow.show_date);
      setLocation(existingShow.location || "");
      setTableCost(existingShow.table_cost.toString());
      setBoothNumber(existingShow.booth_number || "");
      setNotes(existingShow.notes || "");
      setShowStatus(existingShow.status as "planned" | "active" | "completed");
    }
  }, [existingShow]);

  useEffect(() => {
    if (isEditMode && !loadingShow && !existingShow) {
      toast({
        title: "Error loading show",
        description: "Show not found",
        variant: "destructive",
      });
      navigate("/shows");
    }
  }, [isEditMode, loadingShow, existingShow, toast, navigate]);

  const [errors, setErrors] = useState({
    showName: "",
    showDate: "",
    location: "",
    tableCost: "",
  });

  const validateForm = () => {
    const newErrors = {
      showName: "",
      showDate: "",
      location: "",
      tableCost: "",
    };

    let isValid = true;

    if (!showName.trim()) {
      newErrors.showName = "Show name is required";
      isValid = false;
    }

    if (!showDate) {
      newErrors.showDate = "Date is required";
      isValid = false;
    } else if (!isEditMode || showStatus === "planned") {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      if (showDate < todayStr) {
        newErrors.showDate = "Date cannot be in the past";
        isValid = false;
      }
    }

    if (!location.trim()) {
      newErrors.location = "Location is required";
      isValid = false;
    }

    if (!tableCost || parseFloat(tableCost) < 0) {
      newErrors.tableCost = "Table cost must be 0 or greater";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const isFormValid = () => {
    const basicValidation = 
      showName.trim() !== "" &&
      showDate !== "" &&
      location.trim() !== "" &&
      tableCost !== "" &&
      parseFloat(tableCost) >= 0;
    
    if (!isEditMode || showStatus === "planned") {
      return basicValidation && showDate >= format(new Date(), "yyyy-MM-dd");
    }
    
    return basicValidation;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const showData = {
        name: showName.trim(),
        show_date: showDate,
        location: location.trim(),
        table_cost: parseRequiredAmount(tableCost),
        booth_number: boothNumber.trim() || null,
        notes: notes.trim() || null,
      };

      if (isEditMode) {
        const { error } = await supabase
          .from("shows")
          .update(showData)
          .eq("id", id);

        if (error) throw error;

        toast({
          title: "Show updated!",
          description: `${showName} has been updated successfully`,
        });
      } else {
        const { error } = await supabase.from("shows").insert({
          ...showData,
          user_id: user.id,
          status: "planned",
        });

        if (error) throw error;

        toast({
          title: "Show created!",
          description: `${showName} scheduled for ${format(new Date(showDate), "MMM dd, yyyy")}`,
        });
      }

      navigate("/shows");
    } catch (error: any) {
      console.error(`${isEditMode ? "Update" : "Create"} show error:`, error);
      toast({
        title: `Error ${isEditMode ? "updating" : "creating"} show`,
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate("/shows");
  };

  if (isEditMode && loadingShow) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading show data...</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        <h1 className="page-title mb-2">{isEditMode ? "EDIT SHOW" : "CREATE SHOW"}</h1>
        <p className="text-muted-foreground">Plan your next card show event</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-4">
        <FormField
          label="Show Name"
          required
          error={errors.showName}
          htmlFor="show-name"
        >
          <Input
            id="show-name"
            type="text"
            value={showName}
            onChange={(e) => {
              setShowName(e.target.value);
              if (errors.showName) setErrors({ ...errors, showName: "" });
            }}
            placeholder="Dallas Sports Card Show"
            maxLength={100}
            className="min-h-[44px]"
          />
        </FormField>

        <FormField
          label="Date"
          required
          error={errors.showDate}
          htmlFor="show-date"
        >
          <DateInput
            id="show-date"
            value={showDate}
            onChange={(e) => {
              setShowDate(e.target.value);
              if (errors.showDate) setErrors({ ...errors, showDate: "" });
            }}
            min={format(new Date(), "yyyy-MM-dd")}
          />
        </FormField>

        <FormField
          label="Location"
          required
          error={errors.location}
          htmlFor="location"
        >
          <Input
            id="location"
            type="text"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              if (errors.location) setErrors({ ...errors, location: "" });
            }}
            placeholder="Dallas Convention Center"
            maxLength={200}
            className="min-h-[44px]"
          />
        </FormField>

        <FormField
          label="Table Cost"
          required
          error={errors.tableCost}
          htmlFor="table-cost"
        >
          <CurrencyInput
            id="table-cost"
            value={tableCost}
            onChange={(e) => {
              setTableCost(e.target.value);
              if (errors.tableCost) setErrors({ ...errors, tableCost: "" });
            }}
            placeholder="0.00"
            min="0"
          />
        </FormField>

        <FormField
          label="Booth Number"
          htmlFor="booth-number"
        >
          <Input
            id="booth-number"
            type="text"
            value={boothNumber}
            onChange={(e) => setBoothNumber(e.target.value)}
            placeholder="A-123"
            maxLength={20}
            className="min-h-[44px]"
          />
        </FormField>

        <FormField
          label="Notes"
          htmlFor="notes"
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details about the show..."
            maxLength={500}
            rows={4}
          />
        </FormField>

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
              isEditMode ? "UPDATE SHOW" : "CREATE SHOW"
            )}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
