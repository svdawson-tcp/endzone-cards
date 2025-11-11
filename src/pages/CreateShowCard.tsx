import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { compressPhoto, validatePhotoFile } from "@/lib/photoCompression";
import { Loader2, Info, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export default function CreateShowCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { id } = useParams();
  const isEditMode = !!id;

  const [selectedLotId, setSelectedLotId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [year, setYear] = useState("");
  const [brand, setBrand] = useState("");
  const [set, setSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [condition, setCondition] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [frontPhoto, setFrontPhoto] = useState<File | null>(null);
  const [backPhoto, setBackPhoto] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [existingFrontUrl, setExistingFrontUrl] = useState<string | null>(null);
  const [existingBackUrl, setExistingBackUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const [errors, setErrors] = useState({
    lot: "",
    playerName: "",
    year: "",
    askingPrice: "",
  });

  const currentYear = new Date().getFullYear();

  // Load existing show card data in edit mode
  const { data: existingCard, isLoading: loadingCard } = useQuery({
    queryKey: ["show_card", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("show_cards")
        .select("*, lots!lot_id(source)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Pre-populate form fields when existing card loads
  useEffect(() => {
    if (existingCard) {
      setSelectedLotId(existingCard.lot_id);
      setPlayerName(existingCard.player_name);
      setYear(existingCard.year || "");
      
      // Extract card_details JSONB
      const details = existingCard.card_details as any;
      setBrand(details?.brand || "");
      setSet(details?.set || "");
      setCardNumber(details?.card_number || "");
      setCondition(details?.condition || "");
      
      setCostBasis(existingCard.cost_basis ? existingCard.cost_basis.toString() : "");
      setAskingPrice(existingCard.asking_price ? existingCard.asking_price.toString() : "");
      
      // Set existing photo URLs (not File objects)
      if (existingCard.photo_front_url) {
        setFrontPreview(existingCard.photo_front_url);
        setExistingFrontUrl(existingCard.photo_front_url);
      }
      if (existingCard.photo_back_url) {
        setBackPreview(existingCard.photo_back_url);
        setExistingBackUrl(existingCard.photo_back_url);
      }
    }
  }, [existingCard]);

  // Handle load errors
  useEffect(() => {
    if (isEditMode && !loadingCard && !existingCard) {
      toast({
        title: "Error loading show card",
        description: "Show card not found",
        variant: "destructive",
      });
      navigate("/show-cards");
    }
  }, [isEditMode, loadingCard, existingCard, toast, navigate]);

  // Fetch active lots
  const { data: lots, isLoading: loadingLots } = useQuery({
    queryKey: ["active-lots-for-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, source, purchase_date, total_cost")
        .eq("status", "active")
        .order("purchase_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleFrontPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validatePhotoFile(file);
      setFrontPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFrontPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({
        title: "Invalid photo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBackPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validatePhotoFile(file);
      setBackPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBackPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({
        title: "Invalid photo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removeFrontPhoto = () => {
    setFrontPhoto(null);
    setFrontPreview(null);
    setExistingFrontUrl(null);
  };

  const removeBackPhoto = () => {
    setBackPhoto(null);
    setBackPreview(null);
    setExistingBackUrl(null);
  };

  const validateForm = () => {
    const newErrors = {
      lot: "",
      playerName: "",
      year: "",
      askingPrice: "",
    };

    let isValid = true;

    if (!selectedLotId) {
      newErrors.lot = "Lot is required";
      isValid = false;
    }

    if (!playerName.trim()) {
      newErrors.playerName = "Player name is required";
      isValid = false;
    }

    if (!year || parseInt(year) < 1950 || parseInt(year) > currentYear + 1) {
      newErrors.year = `Year must be between 1950 and ${currentYear + 1}`;
      isValid = false;
    }

    if (!askingPrice || parseFloat(askingPrice) <= 0) {
      newErrors.askingPrice = "Asking price must be greater than 0";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const isFormValid = () => {
    return (
      selectedLotId !== "" &&
      playerName.trim() !== "" &&
      year !== "" &&
      parseInt(year) >= 1950 &&
      parseInt(year) <= currentYear + 1 &&
      askingPrice !== "" &&
      parseFloat(askingPrice) > 0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let frontPhotoUrl = existingFrontUrl;
      let backPhotoUrl = existingBackUrl;

      // Helper function to delete old photo from storage
      const deletePhotoFromStorage = async (url: string) => {
        if (!url) return;
        try {
          const path = url.split('/show_cards/')[1];
          if (path) {
            await supabase.storage.from("show_cards").remove([path]);
          }
        } catch (error) {
          console.error("Error deleting old photo:", error);
        }
      };

      // Handle front photo
      if (frontPhoto) {
        // New photo selected - upload it
        setUploadProgress("Processing front photo...");
        const compressedFront = await compressPhoto(frontPhoto);
        const frontFileName = `${user.id}/${Date.now()}_front.webp`;

        const { error: frontError } = await supabase.storage
          .from("show_cards")
          .upload(frontFileName, compressedFront, {
            contentType: "image/webp",
            upsert: false,
          });

        if (frontError) throw frontError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("show_cards").getPublicUrl(frontFileName);

        frontPhotoUrl = publicUrl;

        // Delete old photo if it exists
        if (isEditMode && existingFrontUrl) {
          await deletePhotoFromStorage(existingFrontUrl);
        }
      } else if (!frontPreview && isEditMode && existingFrontUrl) {
        // Photo was removed in edit mode
        await deletePhotoFromStorage(existingFrontUrl);
        frontPhotoUrl = null;
      }

      // Handle back photo
      if (backPhoto) {
        // New photo selected - upload it
        setUploadProgress("Processing back photo...");
        const compressedBack = await compressPhoto(backPhoto);
        const backFileName = `${user.id}/${Date.now()}_back.webp`;

        const { error: backError } = await supabase.storage
          .from("show_cards")
          .upload(backFileName, compressedBack, {
            contentType: "image/webp",
            upsert: false,
          });

        if (backError) throw backError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("show_cards").getPublicUrl(backFileName);

        backPhotoUrl = publicUrl;

        // Delete old photo if it exists
        if (isEditMode && existingBackUrl) {
          await deletePhotoFromStorage(existingBackUrl);
        }
      } else if (!backPreview && isEditMode && existingBackUrl) {
        // Photo was removed in edit mode
        await deletePhotoFromStorage(existingBackUrl);
        backPhotoUrl = null;
      }

      setUploadProgress(isEditMode ? "Updating card..." : "Creating card...");

      // Build card_details JSONB
      const cardDetails = {
        brand: brand || null,
        set: set || null,
        card_number: cardNumber || null,
        condition: condition || null,
      };

      const cardData = {
        player_name: playerName.trim(),
        year: year,
        card_details: cardDetails,
        cost_basis: costBasis ? parseFloat(costBasis) : null,
        asking_price: parseFloat(askingPrice),
        photo_front_url: frontPhotoUrl,
        photo_back_url: backPhotoUrl,
      };

      if (isEditMode) {
        // Update existing show card
        const { error } = await supabase
          .from("show_cards")
          .update(cardData)
          .eq("id", id);

        if (error) throw error;

        toast({
          title: "Show card updated!",
          description: `${playerName} (${year}) has been updated successfully`,
        });
      } else {
        // Create new show card
        const { error } = await supabase.from("show_cards").insert({
          ...cardData,
          user_id: user.id,
          lot_id: selectedLotId,
          status: "available",
        });

        if (error) throw error;

        toast({
          title: "Show card added!",
          description: `${playerName} (${year}) added to inventory`,
        });
      }

      navigate("/show-cards");
    } catch (error: any) {
      console.error(`${isEditMode ? "Update" : "Create"} show card error:`, error);
      toast({
        title: `Error ${isEditMode ? "updating" : "creating"} show card`,
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setUploadProgress("");
    }
  };

  const handleCancel = () => {
    navigate("/show-cards");
  };

  if (loadingLots || (isEditMode && loadingCard)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isEditMode ? "Loading show card data..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (!isEditMode && (!lots || lots.length === 0)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-h1 mb-2">ADD SHOW CARD</h1>
          <Alert className="mt-6 bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-500">
            <Info className="h-5 w-5 text-yellow-500" />
            <AlertDescription className="ml-2">
              No active lots found. You need to create a lot first before adding show
              cards.
            </AlertDescription>
          </Alert>
          <div className="mt-6">
            <Button
              onClick={() => navigate("/lots/new")}
              className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
            >
              Create a Lot
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-h1 mb-2">{isEditMode ? "EDIT SHOW CARD" : "ADD SHOW CARD"}</h1>
          <p className="text-muted-foreground">
            {isEditMode ? "Update card details" : "Add a premium card to your inventory"}
          </p>
        </div>

        {/* Info Callout - only show in create mode */}
        {!isEditMode && (
          <Alert className="mb-6 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500">
            <Info className="h-5 w-5 text-blue-500" />
            <AlertDescription className="ml-2 text-blue-900 dark:text-blue-100">
              Show cards are premium inventory items that you photograph and track
              individually. These are your best cards that you'll showcase at shows.
            </AlertDescription>
          </Alert>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-card shadow-card-shadow rounded-lg p-6 space-y-4"
        >
          {/* Select Lot */}
          <div>
            <label htmlFor="lot" className="form-label">Lot *</label>
            <Select 
              value={selectedLotId} 
              onValueChange={setSelectedLotId}
              disabled={isEditMode}
            >
              <SelectTrigger className="mt-2 min-h-[44px]">
                <SelectValue placeholder="Select lot this card came from" />
              </SelectTrigger>
              <SelectContent>
                {isEditMode && existingCard ? (
                  <SelectItem value={existingCard.lot_id}>
                    {existingCard.lots?.source || "Unknown Lot"}
                  </SelectItem>
                ) : (
                  lots?.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.source} - ${lot.total_cost} (
                      {format(new Date(lot.purchase_date), "MMM dd, yyyy")})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {isEditMode ? "Lot cannot be changed in edit mode" : "Which purchase did this card come from?"}
            </p>
            {errors.lot && <p className="text-destructive text-sm mt-1">{errors.lot}</p>}
          </div>

          {/* Player Name */}
          <div>
            <label htmlFor="player-name" className="form-label">Player Name *</label>
            <Input
              id="player-name"
              type="text"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                if (errors.playerName) setErrors({ ...errors, playerName: "" });
              }}
              placeholder="Dak Prescott"
              maxLength={100}
              className="mt-2 min-h-[44px]"
            />
            {errors.playerName && (
              <p className="text-destructive text-sm mt-1">{errors.playerName}</p>
            )}
          </div>

          {/* Year */}
          <div>
            <label htmlFor="year" className="form-label">Year *</label>
            <Input
              id="year"
              type="number"
              min="1950"
              max={currentYear + 1}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                if (errors.year) setErrors({ ...errors, year: "" });
              }}
              placeholder="2016"
              className="mt-2 min-h-[44px]"
            />
            {errors.year && <p className="text-destructive text-sm mt-1">{errors.year}</p>}
          </div>

          {/* Card Details - Collapsible Section */}
          <div className="border border-border rounded-lg p-4">
            <label className="form-label text-base font-semibold mb-3 block">
              Card Details (Optional)
            </label>
            <div className="space-y-3">
              <div>
                <label htmlFor="brand" className="form-label text-sm">
                  Brand
                </label>
                <Input
                  id="brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Panini, Topps, Upper Deck..."
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="set" className="form-label text-sm">
                  Set
                </label>
                <Input
                  id="set"
                  type="text"
                  value={set}
                  onChange={(e) => setSet(e.target.value)}
                  placeholder="Prizm, Donruss, Select..."
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="card-number" className="form-label text-sm">
                  Card Number
                </label>
                <Input
                  id="card-number"
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="#145"
                  className="mt-1 min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="condition" className="form-label text-sm">
                  Condition
                </label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger className="mt-1 min-h-[44px]">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mint">Mint</SelectItem>
                    <SelectItem value="Near Mint">Near Mint</SelectItem>
                    <SelectItem value="Excellent">Excellent</SelectItem>
                    <SelectItem value="Good">Good</SelectItem>
                    <SelectItem value="Fair">Fair</SelectItem>
                    <SelectItem value="Poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Cost Basis */}
          <div>
            <label htmlFor="cost-basis" className="form-label">Cost Basis (Optional)</label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="cost-basis"
                type="number"
                step="0.01"
                min="0"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="Leave empty to auto-calculate"
                className="pl-8 min-h-[44px]"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Card's cost from lot. Leave blank to calculate later.
            </p>
          </div>

          {/* Asking Price */}
          <div>
            <label htmlFor="asking-price" className="form-label">Asking Price *</label>
            <div className="relative mt-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="asking-price"
                type="number"
                step="0.01"
                min="0.01"
                value={askingPrice}
                onChange={(e) => {
                  setAskingPrice(e.target.value);
                  if (errors.askingPrice) setErrors({ ...errors, askingPrice: "" });
                }}
                placeholder="25.00"
                className="pl-8 min-h-[44px]"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              What price will you list this card at?
            </p>
            {errors.askingPrice && (
              <p className="text-destructive text-sm mt-1">{errors.askingPrice}</p>
            )}
          </div>

          {/* Front Photo */}
          <div>
            <label className="form-label">Front Photo (Optional)</label>
            <div className="mt-2">
              {!frontPreview ? (
                <label
                  htmlFor="front-photo"
                  className="flex flex-col items-center justify-center border-2 border-dashed border-input hover:border-[hsl(var(--navy-base))] p-8 rounded-lg cursor-pointer transition-colors"
                >
                  <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload front photo
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, or WebP. Max 10MB. Will be compressed.
                  </span>
                  <input
                    id="front-photo"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFrontPhotoSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={frontPreview}
                    alt="Front preview"
                    className="max-w-xs rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={removeFrontPhoto}
                    className="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full hover:bg-destructive/90"
                  >
                    <X size={16} />
                  </button>
                  {frontPhoto && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {frontPhoto.name} ({(frontPhoto.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Back Photo */}
          <div>
            <label className="form-label">Back Photo (Optional)</label>
            <div className="mt-2">
              {!backPreview ? (
                <label
                  htmlFor="back-photo"
                  className="flex flex-col items-center justify-center border-2 border-dashed border-input hover:border-[hsl(var(--navy-base))] p-8 rounded-lg cursor-pointer transition-colors"
                >
                  <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload back photo
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, or WebP. Max 10MB. Will be compressed.
                  </span>
                  <input
                    id="back-photo"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleBackPhotoSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={backPreview}
                    alt="Back preview"
                    className="max-w-xs rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={removeBackPhoto}
                    className="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full hover:bg-destructive/90"
                  >
                    <X size={16} />
                  </button>
                  {backPhoto && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {backPhoto.name} ({(backPhoto.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              onClick={handleCancel}
              variant="outline"
              className="flex-1 min-h-[44px]"
              disabled={isSubmitting}
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
                  {uploadProgress || (isEditMode ? "Updating..." : "Creating...")}
                </>
              ) : (
                isEditMode ? "UPDATE SHOW CARD" : "ADD SHOW CARD"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
