import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { CameraCapture } from "@/components/forms/CameraCapture";
import { compressPhoto } from "@/lib/photoCompression";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

const EXPENSE_CATEGORIES = [
  "Booth Fee",
  "Travel",
  "Supplies",
  "Meals",
  "Other",
] as const;

type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export default function CreateExpense() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Default date: today
  const defaultDateStr = format(new Date(), "yyyy-MM-dd");

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [selectedShowId, setSelectedShowId] = useState("");
  const [expenseDate, setExpenseDate] = useState(defaultDateStr);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [receiptPhotoUrl, setReceiptPhotoUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // Fetch all shows for dropdown
  const { data: shows = [], isLoading: loadingShows } = useQuery({
    queryKey: ["shows"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shows")
        .select("id, name, show_date, status")
        .eq("user_id", user.id)
        .order("show_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const [errors, setErrors] = useState({
    amount: "",
    category: "",
    expenseDate: "",
  });

  const validateForm = () => {
    const newErrors = {
      amount: "",
      category: "",
      expenseDate: "",
    };

    let isValid = true;

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = "Amount must be greater than 0";
      isValid = false;
    }

    if (!category) {
      newErrors.category = "Category is required";
      isValid = false;
    }

    if (!expenseDate) {
      newErrors.expenseDate = "Expense date is required";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const isFormValid = () => {
    return (
      amount !== "" &&
      parseFloat(amount) > 0 &&
      category !== "" &&
      expenseDate !== ""
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Not authenticated");
      }

      let photoUrl: string | null = null;

      // Upload receipt photo if provided
      if (receiptPhoto) {
        const compressedPhoto = await compressPhoto(receiptPhoto);
        const fileName = `${user.id}/${Date.now()}_receipt.webp`;

        const { error: uploadError } = await supabase.storage
          .from("expense_receipts")
          .upload(fileName, compressedPhoto, {
            contentType: "image/webp",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("expense_receipts").getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      // Insert expense record
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        amount: amount as any,
        category,
        show_id: selectedShowId || null,
        expense_date: expenseDate,
        notes: notes.trim() || null,
        receipt_photo_url: photoUrl,
      });

      if (error) throw error;

      toast({
        title: "Expense recorded!",
        description: `$${parseFloat(amount).toFixed(2)} for ${category}`,
      });

      // Navigate to shows page
      navigate("/shows");
    } catch (error: any) {
      console.error("Error creating expense:", error);
      toast({
        title: "Error recording expense",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          {/* Page Title - Uses page-title class for white text on dark background */}
          <h1 className="page-title mb-2">RECORD EXPENSE</h1>
          <p className="text-muted-foreground">
            Track business expenses for accounting and tax purposes
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-card shadow-card-shadow rounded-lg p-6 space-y-6">
          {/* Amount Field */}
          <FormField
            label="Amount"
            htmlFor="amount"
            required
            error={errors.amount}
            helperText="Enter the total expense amount"
          >
            <CurrencyInput
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-11"
            />
          </FormField>

          {/* Category Field */}
          <FormField
            label="Category"
            htmlFor="category"
            required
            error={errors.category}
            helperText="Select the type of expense"
          >
            <Select value={category} onValueChange={(value) => setCategory(value as ExpenseCategory)}>
              <SelectTrigger id="category" className="h-11 bg-white text-card-foreground placeholder:opacity-50">
                <SelectValue placeholder="Select expense category" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Show Field (Optional) */}
          <FormField
            label="Show (Optional)"
            htmlFor="show"
            helperText="Associate expense with a specific show, or leave blank for general business expense"
          >
            <Select value={selectedShowId} onValueChange={setSelectedShowId}>
              <SelectTrigger id="show" className="h-11 bg-white text-card-foreground placeholder:opacity-50">
                <SelectValue placeholder="Select show (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                {loadingShows ? (
                  <SelectItem value="loading" disabled>
                    Loading shows...
                  </SelectItem>
                ) : shows && shows.length > 0 ? (
                  shows.map((show) => (
                    <SelectItem key={show.id} value={show.id}>
                      {show.name} - {format(new Date(show.show_date), "MMM dd, yyyy")}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No shows available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </FormField>

          {/* Expense Date Field */}
          <FormField
            label="Expense Date"
            htmlFor="expenseDate"
            required
            error={errors.expenseDate}
            helperText="When did this expense occur?"
          >
            <DateInput
              id="expenseDate"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="h-11"
            />
          </FormField>

          {/* Notes Field */}
          <FormField
            label="Description / Notes"
            htmlFor="notes"
            helperText={`${notes.length}/500 characters`}
          >
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                if (e.target.value.length <= 500) {
                  setNotes(e.target.value);
                }
              }}
              placeholder="Add any additional details about this expense..."
              className="min-h-[100px] bg-white text-card-foreground placeholder:opacity-50 resize-none"
              maxLength={500}
            />
          </FormField>

          {/* Receipt Photo Field */}
          <FormField
            label="Receipt Photo (Optional)"
            htmlFor="receipt-photo"
            helperText="Capture or upload a photo of your receipt for record keeping"
          >
            <div className="space-y-3">
              {/* Camera Capture */}
              {showCamera ? (
                <div className="space-y-3">
                  <CameraCapture
                    onCapture={(file) => {
                      setReceiptPhoto(file);
                      setReceiptPhotoUrl(URL.createObjectURL(file));
                      setShowCamera(false);
                    }}
                    onClose={() => setShowCamera(false)}
                  />
                </div>
              ) : receiptPhotoUrl ? (
                /* Photo Preview */
                <div className="relative">
                  <img
                    src={receiptPhotoUrl}
                    alt="Receipt preview"
                    className="w-full h-48 object-cover rounded-lg border border-border"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setReceiptPhoto(null);
                      setReceiptPhotoUrl(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                /* Upload Options */
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => setShowCamera(true)}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Capture Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          setReceiptPhoto(file);
                          setReceiptPhotoUrl(URL.createObjectURL(file));
                        }
                      };
                      input.click();
                    }}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Select File
                  </Button>
                </div>
              )}
            </div>
          </FormField>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/shows")}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold uppercase"
              disabled={!isFormValid() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "RECORD EXPENSE"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
