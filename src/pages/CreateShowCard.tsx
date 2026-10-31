import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { compressPhoto, validatePhotoFile } from "@/lib/photoCompression";
import { Loader2, Info, Upload, X, Camera, ScanLine, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { prepareForReading, readCard, type CardReadFields } from "@/lib/cardReader";
import { CameraCapture } from "@/components/forms/CameraCapture";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { formatBusinessDate } from "@/lib/dateUtils";
import { PageContainer } from "@/components/layout/AppLayout";
import { parseAmount } from "@/lib/numericUtils";
import { HoldWarning } from "@/components/showCards/HoldWarning";

// Raw-card conditions Colton picks by hand. A graded card's condition is its grade, e.g. "PSA 10".
const RAW_CONDITIONS = ["Mint", "Near Mint", "Excellent", "Good", "Fair", "Poor"];

// Fields the card reader can fill. Lot, cost basis and asking price are never filled for you.
type ReadKey =
  | "playerName" | "year" | "brand" | "set" | "cardNumber" | "parallel" | "serialNumber"
  | "condition" | "certNumber" | "rookie" | "autograph" | "sport" | "team";
type ReadMark = { kind: "read" | "check"; note: string | null };
type ReadState = "idle" | "reading" | "done" | "graded" | "not_card" | "limit" | "error";

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
  const [parallel, setParallel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [rookie, setRookie] = useState(false);
  const [autograph, setAutograph] = useState(false);
  const [costBasis, setCostBasis] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  // Website (cssportscards.com "Shop the Case")
  const [showOnWebsite, setShowOnWebsite] = useState(false);
  const [sport, setSport] = useState("");
  const [team, setTeam] = useState("");
  // Website offers: "Make an Offer" button, and a private auto-accept floor (blank = review every offer)
  const [acceptOffers, setAcceptOffers] = useState(false);
  const [offerFloor, setOfferFloor] = useState("");
  const [frontPhoto, setFrontPhoto] = useState<File | null>(null);
  const [backPhoto, setBackPhoto] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [existingFrontUrl, setExistingFrontUrl] = useState<string | null>(null);
  const [existingBackUrl, setExistingBackUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [showFrontCamera, setShowFrontCamera] = useState(false);
  const [showBackCamera, setShowBackCamera] = useState(false);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  // Card reader state
  const [readState, setReadState] = useState<ReadState>("idle");
  const [marks, setMarks] = useState<Partial<Record<ReadKey, ReadMark>>>({});
  const userEdited = useRef<Set<ReadKey>>(new Set()); // typed by hand: the reader never overwrites these
  const readFilled = useRef<Set<ReadKey>>(new Set()); // filled by the reader: a new read may replace these
  const readSeq = useRef(0);

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
      setParallel(details?.parallel || "");
      setSerialNumber(details?.serial_number || "");
      setCertNumber(details?.cert_number || "");
      setRookie(details?.rookie === true);
      setAutograph(details?.autograph === true);
      
      setCostBasis(existingCard.cost_basis ? existingCard.cost_basis.toString() : "");
      setAskingPrice(existingCard.asking_price ? existingCard.asking_price.toString() : "");
      setShowOnWebsite(!!existingCard.show_on_website);
      setSport(existingCard.sport || "");
      setTeam(existingCard.team || "");
      setAcceptOffers(!!existingCard.accept_offers);
      setOfferFloor(existingCard.offer_floor != null ? Number(existingCard.offer_floor).toFixed(2) : "");
      
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

  // Teams already used on the user's cards, for the Team suggestions list
  const { data: knownTeams } = useQuery({
    queryKey: ["show-card-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("show_cards")
        .select("team")
        .not("team", "is", null);
      if (error) throw error;
      return Array.from(new Set((data || []).map((r) => r.team as string))).sort();
    },
  });

  // Why a card can't go on the website yet (null = it can). Mirrors the
  // show_cards_website_ready rule in the database.
  const websiteBlocker = (() => {
    const price = parseFloat(askingPrice);
    if (!(price >= 10)) return "Asking price must be $10 or more to list on the website.";
    if (!frontPreview) return "Add a front photo to list on the website.";
    return null;
  })();
  const websiteOn = showOnWebsite && !websiteBlocker;

  // Auto-accept floor: blank, or a positive dollar amount. Above the asking price is allowed but warned.
  const floorTrim = offerFloor.trim();
  const floorNum = parseFloat(floorTrim);
  const floorError =
    floorTrim === "" ? "" : !/^\d+(\.\d{1,2})?$/.test(floorTrim) || !(floorNum > 0) ? "Enter an amount above $0, or leave it blank." : "";
  const askingNum = parseFloat(askingPrice);
  const floorWarning =
    !floorError && floorTrim !== "" && askingNum > 0 && floorNum > askingNum
      ? "This is above the asking price, so no offer will ever be auto-accepted."
      : "";
  const floorPicks = askingNum > 0 ? [0.9, 0.85, 0.8].map((r) => ({ pct: Math.round(r * 100), value: (Math.round(askingNum * r * 100) / 100).toFixed(2) })) : [];

  // ---------------------------------------------------------------------------
  // Card reader: reads the details off the photos and fills the empty fields.
  // ---------------------------------------------------------------------------
  const textSetters: Record<Exclude<ReadKey, "rookie" | "autograph">, (v: string) => void> = {
    playerName: setPlayerName, year: setYear, brand: setBrand, set: setSet, cardNumber: setCardNumber,
    parallel: setParallel, serialNumber: setSerialNumber, condition: setCondition, certNumber: setCertNumber,
    sport: setSport, team: setTeam,
  };
  const current: Record<ReadKey, string | boolean> = {
    playerName, year, brand, set, cardNumber, parallel, serialNumber, condition, certNumber, sport, team, rookie, autograph,
  };
  const currentRef = useRef(current);
  currentRef.current = current;

  /** Call from a field's onChange: the user's own value wins over the reader from now on. */
  const markEdited = (key: ReadKey) => {
    userEdited.current.add(key);
    readFilled.current.delete(key);
    setMarks((m) => {
      if (!m[key]) return m;
      const next = { ...m };
      delete next[key];
      return next;
    });
  };

  const applyRead = (f: CardReadFields) => {
    const now = currentRef.current;
    const nextMarks: Partial<Record<ReadKey, ReadMark>> = {};
    const canFill = (k: ReadKey) => !userEdited.current.has(k) && (readFilled.current.has(k) || !now[k]);
    const put = (k: Exclude<ReadKey, "rookie" | "autograph">, value: string | null, sure: boolean, note: string | null) => {
      if (!canFill(k)) return;
      if (!value) {
        // Nothing readable. For the required fields, say why so it's clear what to type.
        if ((k === "playerName" || k === "year") && note) nextMarks[k] = { kind: "check", note };
        if (readFilled.current.has(k)) { textSetters[k](""); readFilled.current.delete(k); }
        return;
      }
      textSetters[k](value);
      readFilled.current.add(k);
      nextMarks[k] = sure ? { kind: "read", note: null } : { kind: "check", note };
    };
    const flag = (k: "rookie" | "autograph", field: CardReadFields["rookie"], set: (v: boolean) => void) => {
      if (!canFill(k) || !field.value) return;
      set(true);
      readFilled.current.add(k);
      nextMarks[k] = field.sure ? { kind: "read", note: null } : { kind: "check", note: field.note };
    };

    put("playerName", f.player_name.value, f.player_name.sure, f.player_name.note);
    put("year", f.year.value, f.year.sure, f.year.note);
    put("brand", f.brand.value, f.brand.sure, f.brand.note);
    put("set", f.set_name.value, f.set_name.sure, f.set_name.note);
    put("cardNumber", f.card_number.value, f.card_number.sure, f.card_number.note);
    put("parallel", f.parallel.value, f.parallel.sure, f.parallel.note);
    put("serialNumber", f.serial_number.value, f.serial_number.sure, f.serial_number.note);
    flag("rookie", f.rookie, setRookie);
    flag("autograph", f.autograph, setAutograph);
    const graded = f.graded.value && !!f.grade.value;
    if (graded) {
      const label = [f.grading_company.value, f.grade.value].filter(Boolean).join(" ");
      put("condition", label, f.grade.sure && f.grading_company.sure, f.grade.note ?? f.grading_company.note);
      put("certNumber", f.cert_number.value, f.cert_number.sure, f.cert_number.note);
    }
    put("sport", f.sport.value, f.sport.sure, f.sport.note);
    put("team", f.team.value, f.team.sure, f.team.note);

    setMarks(nextMarks);
    return graded;
  };

  const runRead = async () => {
    const frontSource = frontPhoto ?? frontPreview;
    if (!frontSource) return;
    const seq = ++readSeq.current;
    setReadState("reading");
    try {
      const backSource = backPhoto ?? backPreview;
      const [front, back] = await Promise.all([
        prepareForReading(frontSource),
        backSource ? prepareForReading(backSource) : Promise.resolve(null),
      ]);
      const result = await readCard(front, back);
      if (seq !== readSeq.current) return; // a newer read (or Clear) superseded this one
      if (result.status === "limit") return setReadState("limit");
      if (result.status === "error") return setReadState("error");
      if (!result.isSportsCard) return setReadState("not_card");
      const graded = applyRead(result.fields);
      setReadState(graded ? "graded" : "done");
    } catch (e) {
      console.error("Card read failed:", e);
      if (seq === readSeq.current) setReadState("error");
    }
  };

  const clearRead = () => {
    readSeq.current++;
    for (const k of readFilled.current) {
      if (k === "rookie") setRookie(false);
      else if (k === "autograph") setAutograph(false);
      else textSetters[k]("");
    }
    readFilled.current.clear();
    setMarks({});
    setReadState("idle");
  };

  // Adding a new photo while adding a card reads it automatically, after a short pause so that
  // taking the front and then the back costs one read, not two. Editing a card reads only on request.
  useEffect(() => {
    if (isEditMode || !frontPhoto) return;
    const t = setTimeout(() => { void runRead(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontPhoto, backPhoto, isEditMode]);

  const markOf = (k: ReadKey) => marks[k];
  const markInputClass = (k: ReadKey) =>
    marks[k]?.kind === "check" ? "border-amber-500 ring-1 ring-amber-400" : marks[k]?.kind === "read" ? "border-green-600" : "";
  const MarkBadge = ({ k }: { k: ReadKey }) => {
    const m = markOf(k);
    if (!m) return null;
    return m.kind === "read" ? (
      <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800">
        <Check className="h-3 w-3" /> read
      </span>
    ) : (
      <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
        <AlertTriangle className="h-3 w-3" /> check
      </span>
    );
  };
  const MarkNote = ({ k }: { k: ReadKey }) => {
    const m = markOf(k);
    return m?.kind === "check" && m.note ? <p className="mt-1 text-sm text-amber-300">{m.note}</p> : null;
  };

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
    readSeq.current++;
    if (readState === "reading") setReadState("idle");
    setFrontPhoto(null);
    setFrontPreview(null);
    setExistingFrontUrl(null);
  };

  const removeBackPhoto = () => {
    setBackPhoto(null);
    setBackPreview(null);
    setExistingBackUrl(null);
  };

  const handleFrontCameraCapture = (capturedFile: File) => {
    setShowFrontCamera(false);
    // Reuse existing validation and preview logic
    const mockEvent = { target: { files: [capturedFile] } } as any;
    handleFrontPhotoSelect(mockEvent);
  };

  const handleBackCameraCapture = (capturedFile: File) => {
    setShowBackCamera(false);
    // Reuse existing validation and preview logic
    const mockEvent = { target: { files: [capturedFile] } } as any;
    handleBackPhotoSelect(mockEvent);
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
      parseFloat(askingPrice) > 0 &&
      (!websiteOn || (sport !== "" && team.trim() !== "")) &&
      !floorError
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
        parallel: parallel.trim() || null,
        serial_number: serialNumber.trim() || null,
        cert_number: certNumber.trim() || null,
        rookie: rookie || null,
        autograph: autograph || null,
      };

      const cardData = {
        player_name: playerName.trim(),
        year: year,
        card_details: cardDetails,
        cost_basis: parseAmount(costBasis),
        asking_price: parseAmount(askingPrice),
        photo_front_url: frontPhotoUrl,
        photo_back_url: backPhotoUrl,
        sport: sport || null,
        team: team.trim() || null,
        // Never send "on" for a card that isn't ready; the database rejects it anyway.
        show_on_website: websiteOn && !!frontPhotoUrl && sport !== "" && team.trim() !== "",
        accept_offers: acceptOffers,
        offer_floor: floorTrim === "" ? null : Math.round(floorNum * 100) / 100,
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
      <PageContainer maxWidth="2xl">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {isEditMode ? "Loading show card data..." : "Loading..."}
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!isEditMode && (!lots || lots.length === 0)) {
    return (
      <PageContainer maxWidth="2xl">
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
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Create a Lot
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        {/* Page Title - Uses page-title class for white text on dark background */}
        <h1 className="page-title mb-2">{isEditMode ? "EDIT SHOW CARD" : "ADD SHOW CARD"}</h1>
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
          {isEditMode && existingCard?.status === "available" && <HoldWarning holdUntil={existingCard.hold_until} />}
          {/* Front Photo */}
          <div>
            <label className="form-label">Front Photo (Optional)</label>
            {!frontPreview && !isEditMode && (
              <p className="mt-1 text-xs text-muted-foreground">Add the front (and back) and EndZone reads the card details for you.</p>
            )}
            <div className="mt-2">
              {!frontPreview ? (
                <div className="space-y-3">
                  {/* Take Photo Button */}
                  <Button
                    type="button"
                    onClick={() => setShowFrontCamera(true)}
                    className="w-full min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold uppercase"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    TAKE PHOTO
                  </Button>

                  {/* Choose Photo Button */}
                  <Button
                    type="button"
                    onClick={() => frontFileInputRef.current?.click()}
                    variant="outline"
                    className="w-full min-h-[44px] font-semibold uppercase"
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    CHOOSE PHOTO
                  </Button>

                  {/* Hidden file input */}
                  <input
                    ref={frontFileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFrontPhotoSelect}
                    className="hidden"
                  />

                  <p className="text-xs text-gray-600 text-center">
                    JPG, PNG, or WebP. Max 10MB. Will be compressed.
                  </p>
                </div>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={frontPreview}
                    alt="Front preview"
                    className="w-full max-w-full rounded-lg object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeFrontPhoto}
                    className="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full hover:bg-destructive/90"
                  >
                    <X size={16} />
                  </button>
                  {frontPhoto && (
                    <p className="text-xs text-gray-600 mt-1">
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
                <div className="space-y-3">
                  {/* Take Photo Button */}
                  <Button
                    type="button"
                    onClick={() => setShowBackCamera(true)}
                    className="w-full min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold uppercase"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    TAKE PHOTO
                  </Button>

                  {/* Choose Photo Button */}
                  <Button
                    type="button"
                    onClick={() => backFileInputRef.current?.click()}
                    variant="outline"
                    className="w-full min-h-[44px] font-semibold uppercase"
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    CHOOSE PHOTO
                  </Button>

                  {/* Hidden file input */}
                  <input
                    ref={backFileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleBackPhotoSelect}
                    className="hidden"
                  />

                  <p className="text-xs text-gray-600 text-center">
                    JPG, PNG, or WebP. Max 10MB. Will be compressed.
                  </p>
                </div>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={backPreview}
                    alt="Back preview"
                    className="w-full max-w-full rounded-lg object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeBackPhoto}
                    className="absolute top-2 right-2 p-1 bg-destructive text-white rounded-full hover:bg-destructive/90"
                  >
                    <X size={16} />
                  </button>
                  {backPhoto && (
                    <p className="text-xs text-gray-600 mt-1">
                      {backPhoto.name} ({(backPhoto.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card reader status */}
          {readState === "reading" && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-50 p-3 text-blue-900" role="status">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
              <div>
                <p className="font-semibold">Reading card…</p>
                <p className="text-sm">Takes a few seconds. You can keep typing.</p>
              </div>
            </div>
          )}
          {(readState === "done" || readState === "graded") && (
            <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-900" role="status">
              <p className="text-sm">
                {readState === "graded"
                  ? "Graded card read from the label. Grade and cert number filled in."
                  : "Card read. Green fields came from the photos."}{" "}
                Check anything marked ⚠, then add the lot and price.
              </p>
              <p className="mt-2 text-sm">
                <button type="button" onClick={() => void runRead()} className="font-semibold underline">Read again</button>
                {" · "}
                <button type="button" onClick={clearRead} className="font-semibold underline">Clear what was read</button>
              </p>
            </div>
          )}
          {(readState === "not_card" || readState === "limit" || readState === "error") && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900" role="status">
              <p className="text-sm">
                {readState === "not_card" && "This photo doesn't look like a sports card. Fill in the details by hand."}
                {readState === "limit" && "Today's card-reading limit is used up. Fill in the details by hand; reading is back tomorrow."}
                {readState === "error" && "Couldn't read the card just now. Fill in the details by hand, or try again."}
              </p>
              {readState !== "limit" && (
                <button type="button" onClick={() => void runRead()} className="mt-2 text-sm font-semibold underline">Read again</button>
              )}
            </div>
          )}
          {readState === "idle" && frontPreview && (isEditMode || readSeq.current > 0) && (
            <Button type="button" variant="outline" onClick={() => void runRead()} className="w-full min-h-[44px] font-semibold uppercase">
              <ScanLine className="mr-2 h-5 w-5" />
              Read card from photos
            </Button>
          )}

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
                      {formatBusinessDate(lot.purchase_date, "MMM dd, yyyy")})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600 mt-1">
              {isEditMode ? "Lot cannot be changed in edit mode" : "Which purchase did this card come from?"}
            </p>
            {errors.lot && <p className="text-destructive text-sm mt-1">{errors.lot}</p>}
          </div>

          {/* Player Name */}
          <div>
            <label htmlFor="player-name" className="form-label">Player Name *<MarkBadge k="playerName" /></label>
            <Input
              id="player-name"
              type="text"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                markEdited("playerName");
                if (errors.playerName) setErrors({ ...errors, playerName: "" });
              }}
              placeholder="Dak Prescott"
              maxLength={100}
              className={`mt-2 min-h-[44px] ${markInputClass("playerName")}`}
            />
            <MarkNote k="playerName" />
            {errors.playerName && (
              <p className="text-destructive text-sm mt-1">{errors.playerName}</p>
            )}
          </div>

          {/* Year */}
          <div>
            <label htmlFor="year" className="form-label">
              Year * <span className="text-xs text-gray-600 font-normal">(1950-{currentYear + 1})</span><MarkBadge k="year" />
            </label>
            <Input
              id="year"
              type="number"
              min="1950"
              max={currentYear + 1}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                markEdited("year");
                if (errors.year) setErrors({ ...errors, year: "" });
              }}
              placeholder="2016"
              className={`mt-2 min-h-[44px] ${markInputClass("year")}`}
            />
            <MarkNote k="year" />
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
                  Brand<MarkBadge k="brand" />
                </label>
                <Input
                  id="brand"
                  type="text"
                  value={brand}
                  onChange={(e) => { setBrand(e.target.value); markEdited("brand"); }}
                  placeholder="Panini, Topps, Upper Deck..."
                  className={`mt-1 min-h-[44px] ${markInputClass("brand")}`}
                />
                <MarkNote k="brand" />
              </div>
              <div>
                <label htmlFor="set" className="form-label text-sm">
                  Set<MarkBadge k="set" />
                </label>
                <Input
                  id="set"
                  type="text"
                  value={set}
                  onChange={(e) => { setSet(e.target.value); markEdited("set"); }}
                  placeholder="Prizm, Donruss, Select..."
                  className={`mt-1 min-h-[44px] ${markInputClass("set")}`}
                />
                <MarkNote k="set" />
              </div>
              <div>
                <label htmlFor="card-number" className="form-label text-sm">
                  Card Number<MarkBadge k="cardNumber" />
                </label>
                <Input
                  id="card-number"
                  type="text"
                  value={cardNumber}
                  onChange={(e) => { setCardNumber(e.target.value); markEdited("cardNumber"); }}
                  placeholder="#145"
                  className={`mt-1 min-h-[44px] ${markInputClass("cardNumber")}`}
                />
                <MarkNote k="cardNumber" />
              </div>
              <div>
                <label htmlFor="parallel" className="form-label text-sm">
                  Parallel<MarkBadge k="parallel" />
                </label>
                <Input
                  id="parallel"
                  type="text"
                  value={parallel}
                  onChange={(e) => { setParallel(e.target.value); markEdited("parallel"); }}
                  placeholder="Silver, Gold... (blank for base)"
                  maxLength={40}
                  className={`mt-1 min-h-[44px] ${markInputClass("parallel")}`}
                />
                <MarkNote k="parallel" />
              </div>
              <div>
                <label htmlFor="serial-number" className="form-label text-sm">
                  Serial #<MarkBadge k="serialNumber" />
                </label>
                <Input
                  id="serial-number"
                  type="text"
                  value={serialNumber}
                  onChange={(e) => { setSerialNumber(e.target.value); markEdited("serialNumber"); }}
                  placeholder="e.g. 23/99"
                  maxLength={20}
                  className={`mt-1 min-h-[44px] ${markInputClass("serialNumber")}`}
                />
                <MarkNote k="serialNumber" />
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
                  <Checkbox
                    checked={rookie}
                    onCheckedChange={(v) => { setRookie(v === true); markEdited("rookie"); }}
                    className="h-5 w-5"
                  />
                  RC · Rookie<MarkBadge k="rookie" />
                </label>
                <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
                  <Checkbox
                    checked={autograph}
                    onCheckedChange={(v) => { setAutograph(v === true); markEdited("autograph"); }}
                    className="h-5 w-5"
                  />
                  Auto<MarkBadge k="autograph" />
                </label>
              </div>
              <div>
                <label htmlFor="condition" className="form-label text-sm">
                  Condition<MarkBadge k="condition" />
                </label>
                {/* Keyed so the menu rebuilds when a graded value like "PSA 10" arrives with its own item. */}
                <Select
                  key={condition && !RAW_CONDITIONS.includes(condition) ? `graded:${condition}` : "raw"}
                  value={condition}
                  onValueChange={(v) => { setCondition(v); markEdited("condition"); }}
                >
                  <SelectTrigger id="condition" className={`mt-1 min-h-[44px] ${markInputClass("condition")}`}>
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {condition && !RAW_CONDITIONS.includes(condition) && (
                      <SelectItem value={condition}>{condition} (graded)</SelectItem>
                    )}
                    {RAW_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MarkNote k="condition" />
              </div>
              {(certNumber || (condition && !RAW_CONDITIONS.includes(condition))) && (
                <div>
                  <label htmlFor="cert-number" className="form-label text-sm">
                    Cert #<MarkBadge k="certNumber" />
                  </label>
                  <Input
                    id="cert-number"
                    type="text"
                    inputMode="numeric"
                    value={certNumber}
                    onChange={(e) => { setCertNumber(e.target.value); markEdited("certNumber"); }}
                    maxLength={20}
                    className={`mt-1 min-h-[44px] ${markInputClass("certNumber")}`}
                  />
                  <MarkNote k="certNumber" />
                </div>
              )}
            </div>
          </div>

          {/* Cost Basis */}
          <div>
            <label htmlFor="cost-basis" className="form-label">Cost Basis (Optional)</label>
            <CurrencyInput
              id="cost-basis"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              placeholder="Leave empty to auto-calculate"
              min={0}
              step={0.01}
              className="mt-2"
            />
            <p className="text-xs text-gray-600 mt-1">
              Card's cost from lot. Leave blank to calculate later.
            </p>
          </div>

          {/* Asking Price */}
          <div>
            <label htmlFor="asking-price" className="form-label">Asking Price *</label>
            <CurrencyInput
              id="asking-price"
              value={askingPrice}
              onChange={(e) => {
                setAskingPrice(e.target.value);
                if (errors.askingPrice) setErrors({ ...errors, askingPrice: "" });
              }}
              placeholder="25.00"
              min={0.01}
              step={0.01}
              className="mt-2"
            />
            <p className="text-xs text-gray-600 mt-1">
              What price will you list this card at?
            </p>
            {errors.askingPrice && (
              <p className="text-destructive text-sm mt-1">{errors.askingPrice}</p>
            )}
          </div>

          {/* Website (cssportscards.com) */}
          <div className="rounded-lg border-2 border-primary p-4 space-y-4">
            <h2 className="text-lg font-bold">Website</h2>
            <div className="flex items-center justify-between gap-4 min-h-[44px]">
              <label htmlFor="show-on-website" className="flex-1">
                <span className="font-semibold block">Show on cssportscards.com</span>
                <span className="text-xs text-gray-600">Appears in Shop the Case within a minute of saving</span>
              </label>
              <Switch
                id="show-on-website"
                checked={websiteOn}
                disabled={!!websiteBlocker}
                onCheckedChange={setShowOnWebsite}
                className="scale-125"
              />
            </div>
            {websiteBlocker && (
              <p className="text-sm rounded-md border border-amber-400 bg-amber-50 text-amber-900 px-3 py-2">
                {websiteBlocker}
                {showOnWebsite && " It will be taken off the website when you save."}
              </p>
            )}
            {websiteOn && (
              <div className="space-y-3 border-t border-border pt-4" data-testid="offer-settings">
                <div className="flex min-h-[44px] items-center justify-between gap-4">
                  <label htmlFor="accept-offers" className="flex-1">
                    <span className="block font-semibold">Take offers</span>
                    <span className="text-xs text-muted-foreground">Shows a Make an Offer button on the website</span>
                  </label>
                  <Switch
                    id="accept-offers"
                    checked={acceptOffers}
                    onCheckedChange={setAcceptOffers}
                    className="scale-125"
                  />
                </div>
                {acceptOffers && (
                  <div>
                    <label htmlFor="offer-floor" className="form-label">Auto-accept offers at or above</label>
                    <CurrencyInput
                      id="offer-floor"
                      value={offerFloor}
                      onChange={(e) => setOfferFloor(e.target.value)}
                      placeholder="Blank: review every offer"
                      aria-invalid={!!floorError}
                      className="mt-2"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Buyers never see this. Leave blank to review every offer yourself.
                    </p>
                    {floorPicks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {floorPicks.map((p) => (
                          <button
                            key={p.pct}
                            type="button"
                            onClick={() => setOfferFloor(p.value)}
                            className={`min-h-[36px] rounded-full border px-3 text-sm font-semibold transition-colors ${
                              floorTrim !== "" && floorNum === Number(p.value)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-card-foreground hover:border-primary"
                            }`}
                          >
                            {p.pct}% · ${Number(p.value) % 1 === 0 ? Number(p.value) : p.value}
                          </button>
                        ))}
                      </div>
                    )}
                    {floorError && <p className="mt-1 text-sm text-destructive">{floorError}</p>}
                    {floorWarning && (
                      <p className="mt-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        {floorWarning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <label htmlFor="website-sport" className="form-label">
                Sport {websiteOn && "*"}<MarkBadge k="sport" />
              </label>
              <Select value={sport} onValueChange={(v) => { setSport(v); markEdited("sport"); }}>
                <SelectTrigger id="website-sport" className={`mt-2 min-h-[44px] ${markInputClass("sport")}`}>
                  <SelectValue placeholder="Choose a sport" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                  <SelectItem value="baseball">Baseball</SelectItem>
                  <SelectItem value="hockey">Hockey</SelectItem>
                  <SelectItem value="soccer">Soccer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="website-team" className="form-label">
                Team {websiteOn && "*"}<MarkBadge k="team" />
              </label>
              <Input
                id="website-team"
                value={team}
                onChange={(e) => { setTeam(e.target.value); markEdited("team"); }}
                list="website-team-options"
                maxLength={60}
                placeholder="e.g. Commanders"
                className={`mt-2 min-h-[44px] ${markInputClass("team")}`}
              />
              <MarkNote k="sport" />
              <MarkNote k="team" />
              <datalist id="website-team-options">
                {(knownTeams || []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {websiteOn && (sport === "" || team.trim() === "") && (
                <p className="text-sm text-destructive mt-1">Sport and team are needed to list on the website.</p>
              )}
            </div>
            <p className="text-xs text-gray-600">
              Marking this card sold anywhere in EndZone takes it off the website automatically.
            </p>
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
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold uppercase min-h-[44px]"
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

      {/* Camera Modals */}
      {showFrontCamera && (
        <CameraCapture
          onCapture={handleFrontCameraCapture}
          onClose={() => setShowFrontCamera(false)}
          facingMode="environment"
        />
      )}

      {showBackCamera && (
        <CameraCapture
          onCapture={handleBackCameraCapture}
          onClose={() => setShowBackCamera(false)}
          facingMode="environment"
        />
      )}
    </PageContainer>
  );
}
