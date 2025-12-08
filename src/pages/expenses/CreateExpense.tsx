import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { PageContainer } from "@/components/layout/AppLayout";
import { parseRequiredAmount } from "@/lib/numericUtils";

const EXPENSE_CATEGORIES = [
  "Booth Fee",
  "Travel",
  "Supplies",
  "Meals",
  "Other",
] as const;

type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export default function CreateExpense() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("");
  const [selectedShowId, setSelectedShowId] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-select show from URL param
  const showIdFromUrl = searchParams.get("showId");
  useEffect(() => {
    if (showIdFromUrl) {
      setSelectedShowId(showIdFromUrl);
    }
  }, [showIdFromUrl]);

  const { data: shows, isLoading: loadingShows } = useQuery({
    queryKey: ["active-shows-for-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("id, name, show_date, table_cost")
        .in("status", ["planned", "active", "completed"])
        .order("show_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }

    if (!category) {
      newErrors.category = "Please select a category";
    }

    if (!expenseDate) {
      newErrors.expenseDate = "Please select a date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isFormValid = () => {
    return amount && parseFloat(amount) > 0 && category && expenseDate;
  };

  const handlePhotoCapture = (file: File) => {
    setReceiptPhoto(file);
    setShowCamera(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptPhoto(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let receiptPhotoUrl: string | null = null;

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

        receiptPhotoUrl = publicUrl;
      }

      // Insert expense
      const { error: insertError } = await supabase.from("expenses").insert({
        user_id: user.id,
        amount: parseRequiredAmount(amount),
        category: category as ExpenseCategory,
        show_id: selectedShowId || null,
        expense_date: expenseDate,
        notes: notes || null,
        receipt_photo_url: receiptPhotoUrl,
      });

      if (insertError) throw insertError;

      toast({
        title: "Expense recorded",
        description: `$${parseFloat(amount).toFixed(2)} ${category} expense added`,
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Create expense error:", error);
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
    <PageContainer maxWidth="2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-h1 mb-2">RECORD EXPENSE</h1>
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
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category" className="h-11">
              <SelectValue placeholder="Select expense category" />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* Booth Fee Warning */}
        {category === "Booth Fee" && selectedShowId && 
          shows?.find(s => s.id === selectedShowId)?.table_cost && 
          (shows.find(s => s.id === selectedShowId)?.table_cost ?? 0) > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-sm text-warning-foreground">
            <strong>Note:</strong> This show already has a booth fee of $
            {(shows.find(s => s.id === selectedShowId)?.table_cost ?? 0).toFixed(2)} 
            recorded in the show setup. Only add an expense here if this is an 
            additional fee.
          </div>
        )}

        {/* Show Field (Optional) */}
        <FormField
          label="Show (Optional)"
          htmlFor="show"
          helperText="Associate expense with a specific show, or leave blank for general business expense"
        >
          <Select 
            value={selectedShowId || "none"} 
            onValueChange={(value) => setSelectedShowId(value === "none" ? "" : value)}
          >
            <SelectTrigger id="show" className="h-11" disabled={loadingShows}>
              <SelectValue placeholder="Select show (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No specific show</SelectItem>
              {shows?.map((show) => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name} - {format(new Date(show.show_date), "MMM dd, yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* Expense Date */}
        <FormField
          label="Expense Date"
          htmlFor="expense-date"
          required
          error={errors.expenseDate}
          helperText="When did this expense occur?"
        >
          <DateInput
            id="expense-date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            max={format(new Date(), "yyyy-MM-dd")}
            className="h-11"
          />
        </FormField>

        {/* Notes */}
        <FormField
          label="Description / Notes"
          htmlFor="notes"
          helperText="Add any additional details about this expense"
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional details about this expense..."
            maxLength={500}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {notes.length}/500 characters
          </p>
        </FormField>

        {/* Receipt Photo */}
        <FormField
          label="Receipt Photo (Optional)"
          htmlFor="receipt-photo"
          helperText="Capture or upload a photo of your receipt for record keeping"
        >
          {!receiptPhoto ? (
            <div className="space-y-3">
              <Button
                type="button"
                onClick={() => setShowCamera(true)}
                variant="outline"
                className="w-full h-11"
              >
                <Receipt className="mr-2 h-4 w-4" />
                Capture Photo
              </Button>
              <Button
                type="button"
                onClick={() => document.getElementById("file-upload")?.click()}
                variant="outline"
                className="w-full h-11"
              >
                <Receipt className="mr-2 h-4 w-4" />
                Select File
              </Button>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative">
              <div className="bg-muted rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm truncate">{receiptPhoto.name}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReceiptPhoto(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </FormField>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/dashboard")}
            disabled={isSubmitting}
            className="flex-1 h-11"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isFormValid() || isSubmitting}
            className="flex-1 h-11 bg-primary hover:bg-primary/90"
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

      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture
          onCapture={handlePhotoCapture}
          onClose={() => setShowCamera(false)}
          facingMode="environment"
        />
      )}
    </PageContainer>
  );
}
