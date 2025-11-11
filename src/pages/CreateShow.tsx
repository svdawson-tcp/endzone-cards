import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

export default function CreateShow() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Default date: 7 days from today
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  const defaultDateStr = format(defaultDate, "yyyy-MM-dd");

  const [showName, setShowName] = useState("");
  const [showDate, setShowDate] = useState(defaultDateStr);
  const [location, setLocation] = useState("");
  const [tableCost, setTableCost] = useState("");
  const [boothNumber, setBoothNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } else {
      const selectedDate = new Date(showDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
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
    return (
      showName.trim() !== "" &&
      showDate !== "" &&
      location.trim() !== "" &&
      tableCost !== "" &&
      parseFloat(tableCost) >= 0 &&
      new Date(showDate) >= new Date(new Date().setHours(0, 0, 0, 0))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("shows").insert({
        user_id: user.id,
        name: showName.trim(),
        show_date: showDate,
        location: location.trim(),
        table_cost: parseFloat(tableCost),
        booth_number: boothNumber.trim() || null,
        status: "planned",
        notes: notes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Show created!",
        description: `${showName} scheduled for ${format(new Date(showDate), "MMM dd, yyyy")}`,
      });

      navigate("/shows");
    } catch (error: any) {
      console.error("Create show error:", error);
      toast({
        title: "Error creating show",
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-h1 mb-2">CREATE SHOW</h1>
          <p className="text-muted-foreground">Plan your next card show event</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-4">
          {/* Show Name */}
          <div>
            <label htmlFor="show-name" className="form-label">Show Name *</label>
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
              className="mt-2 min-h-[44px]"
            />
            {errors.showName && (
              <p className="text-destructive text-sm mt-1">{errors.showName}</p>
            )}
          </div>

          {/* Show Date */}
          <div>
            <label htmlFor="show-date" className="form-label">Date *</label>
            <Input
              id="show-date"
              type="date"
              value={showDate}
              onChange={(e) => {
                setShowDate(e.target.value);
                if (errors.showDate) setErrors({ ...errors, showDate: "" });
              }}
              min={format(new Date(), "yyyy-MM-dd")}
              className="mt-2 min-h-[44px]"
            />
            {errors.showDate && (
              <p className="text-destructive text-sm mt-1">{errors.showDate}</p>
            )}
          </div>

          {/* Location */}
          <div>
            <label htmlFor="location" className="form-label">Location *</label>
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
              className="mt-2 min-h-[44px]"
            />
            {errors.location && (
              <p className="text-destructive text-sm mt-1">{errors.location}</p>
            )}
          </div>

          {/* Table Cost */}
          <div>
            <label htmlFor="table-cost" className="form-label">Table Cost *</label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="table-cost"
                type="number"
                step="0.01"
                min="0"
                value={tableCost}
                onChange={(e) => {
                  setTableCost(e.target.value);
                  if (errors.tableCost) setErrors({ ...errors, tableCost: "" });
                }}
                placeholder="0.00"
                className="pl-8 min-h-[44px]"
              />
            </div>
            {errors.tableCost && (
              <p className="text-destructive text-sm mt-1">{errors.tableCost}</p>
            )}
          </div>

          {/* Booth Number */}
          <div>
            <label htmlFor="booth-number" className="form-label">Booth Number (Optional)</label>
            <Input
              id="booth-number"
              type="text"
              value={boothNumber}
              onChange={(e) => setBoothNumber(e.target.value)}
              placeholder="A-123"
              maxLength={20}
              className="mt-2 min-h-[44px]"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="form-label">Notes (Optional)</label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details about the show..."
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
                "CREATE SHOW"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
