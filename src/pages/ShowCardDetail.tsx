import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { format } from "date-fns";
import {
  ArrowLeft,
  Edit,
  ImageIcon,
  RotateCw,
  RotateCcw,
  ChevronDown,
  Upload,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { compressPhoto, validatePhotoFile } from "@/lib/photoCompression";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const ShowCardDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getEffectiveUserId } = useMentorAccess();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isUploadingFront, setIsUploadingFront] = useState(false);
  const [isUploadingBack, setIsUploadingBack] = useState(false);

  // Handle window resize
  useState(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  const { data: card, isLoading: cardLoading } = useQuery({
    queryKey: ["show-card", id],
    queryFn: async () => {
      const userId = await getEffectiveUserId();

      const { data, error } = await supabase
        .from("show_cards")
        .select("*, lots!show_cards_lot_id_fkey(source, purchase_date, total_cost)")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["show-card-transactions", id],
    queryFn: async () => {
      const userId = await getEffectiveUserId();

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("show_card_id", id)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const saleInfo = useMemo(() => {
    if (card?.status !== "sold" || !transactions.length) return null;

    const saleTransaction = transactions.find(
      (t) => t.transaction_type === "show_card_sale" && t.show_card_id === card.id
    );

    if (!saleTransaction) return null;

    const salePrice = Number(saleTransaction.revenue || 0);
    const askingPrice = Number(card.asking_price || 0);
    const profit = askingPrice > 0 ? salePrice - askingPrice : null;

    return {
      salePrice,
      askingPrice,
      profit,
      saleDate: (saleTransaction as any).transaction_date || saleTransaction.created_at,
      notes: saleTransaction.notes,
    };
  }, [card, transactions]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "available":
        return "default";
      case "sold":
        return "outline";
      case "combined":
        return "secondary";
      case "lost":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const handlePhotoUpload = async (file: File, side: 'front' | 'back') => {
    const setUploading = side === 'front' ? setIsUploadingFront : setIsUploadingBack;
    
    try {
      validatePhotoFile(file);
      setUploading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      // Compress photo
      const compressed = await compressPhoto(file);
      const fileName = `${user.id}/${Date.now()}_${side}.webp`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("show_cards")
        .upload(fileName, compressed, {
          contentType: "image/webp",
          upsert: false,
        });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("show_cards")
        .getPublicUrl(fileName);
      
      // Update show_card record
      const updateField = side === 'front' ? 'photo_front_url' : 'photo_back_url';
      const { error: updateError } = await supabase
        .from("show_cards")
        .update({ [updateField]: publicUrl })
        .eq("id", id);
      
      if (updateError) throw updateError;
      
      // Invalidate query to refresh
      queryClient.invalidateQueries({ queryKey: ["show-card", id] });
      
      toast({
        title: "Photo updated!",
        description: `${side === 'front' ? 'Front' : 'Back'} photo uploaded successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (cardLoading) {
    return (
      <div className="min-h-screen bg-[url('/stadium-bg.png')] bg-cover bg-center bg-fixed">
        <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--navy-base))]/95 to-[hsl(var(--navy-dark))]/98 flex items-center justify-center">
          <div className="text-[hsl(var(--silver-base))]">Loading card details...</div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-[url('/stadium-bg.png')] bg-cover bg-center bg-fixed">
        <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--navy-base))]/95 to-[hsl(var(--navy-dark))]/98 flex items-center justify-center">
          <div className="text-[hsl(var(--silver-base))]">Card not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[url('/stadium-bg.png')] bg-cover bg-center bg-fixed">
      <div className="min-h-screen bg-gradient-to-b from-[hsl(var(--navy-base))]/95 to-[hsl(var(--navy-dark))]/98">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/show-cards")}
              className="min-h-[44px] min-w-[44px] text-white hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="page-title">
                {card.player_name} {card.year}
              </h1>
              <Badge variant={getStatusBadgeVariant(card.status)} className="mt-2">
                {card.status}
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(`/show-cards/${id}/edit`)}
            className="min-h-[44px] min-w-[44px] bg-white/10 text-white border-white/20 hover:bg-white/20"
          >
            <Edit className="h-5 w-5" />
          </Button>
        </div>

        {/* Photo Display Section */}
        <Card className="bg-[hsl(var(--navy-light))]/80 border-[hsl(var(--silver-base))]/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[hsl(var(--silver-light))]">Card Photos</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Hidden file inputs */}
            <input
              type="file"
              id="front-photo-input"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(file, 'front');
                e.target.value = '';
              }}
            />
            <input
              type="file"
              id="back-photo-input"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(file, 'back');
                e.target.value = '';
              }}
            />
            
            {isMobile ? (
              // Mobile: Flippable single card
              <div className="relative w-full max-w-md mx-auto">
                <div
                  className="relative cursor-pointer"
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  {!isFlipped ? (
                    <div className="relative">
                      {card.photo_front_url ? (
                        <label htmlFor="front-photo-input" className="relative cursor-pointer group block">
                          <img
                            src={card.photo_front_url}
                            className="w-full rounded-lg shadow-lg"
                            alt="Card front"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            {isUploadingFront ? (
                              <Loader2 className="h-8 w-8 text-white animate-spin" />
                            ) : (
                              <Upload className="h-8 w-8 text-white" />
                            )}
                          </div>
                        </label>
                      ) : (
                        <label 
                          htmlFor="front-photo-input"
                          className="w-full h-96 bg-[hsl(var(--navy-dark))] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-[hsl(var(--navy-dark))]/80 transition-colors"
                        >
                          {isUploadingFront ? (
                            <Loader2 className="h-16 w-16 text-[hsl(var(--silver-base))] animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-16 w-16 text-[hsl(var(--silver-base))]" />
                              <span className="text-[hsl(var(--silver-base))] mt-2 text-sm">Tap to add photo</span>
                            </>
                          )}
                        </label>
                      )}
                      <div 
                        className="absolute top-3 right-3 bg-black/60 rounded-full p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        onClick={() => setIsFlipped(!isFlipped)}
                      >
                        <RotateCw className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-center text-sm text-[hsl(var(--silver-base))] mt-2">Front • Tap to flip</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {card.photo_back_url ? (
                        <label htmlFor="back-photo-input" className="relative cursor-pointer group block">
                          <img
                            src={card.photo_back_url}
                            className="w-full rounded-lg shadow-lg"
                            alt="Card back"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            {isUploadingBack ? (
                              <Loader2 className="h-8 w-8 text-white animate-spin" />
                            ) : (
                              <Upload className="h-8 w-8 text-white" />
                            )}
                          </div>
                        </label>
                      ) : (
                        <label 
                          htmlFor="back-photo-input"
                          className="w-full h-96 bg-[hsl(var(--navy-dark))] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-[hsl(var(--navy-dark))]/80 transition-colors"
                        >
                          {isUploadingBack ? (
                            <Loader2 className="h-16 w-16 text-[hsl(var(--silver-base))] animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-16 w-16 text-[hsl(var(--silver-base))]" />
                              <span className="text-[hsl(var(--silver-base))] mt-2 text-sm">Tap to add photo</span>
                            </>
                          )}
                        </label>
                      )}
                      <div 
                        className="absolute top-3 right-3 bg-black/60 rounded-full p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                        onClick={() => setIsFlipped(!isFlipped)}
                      >
                        <RotateCcw className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-center text-sm text-[hsl(var(--silver-base))] mt-2">Back • Tap to flip</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Desktop/Tablet: Side by side photos
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-[hsl(var(--silver-base))] mb-2 font-semibold">Front</p>
                  {card.photo_front_url ? (
                    <label htmlFor="front-photo-input" className="relative cursor-pointer group block">
                      <img
                        src={card.photo_front_url}
                        className="w-full rounded-lg shadow-lg"
                        alt="Card front"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        {isUploadingFront ? (
                          <Loader2 className="h-8 w-8 text-white animate-spin" />
                        ) : (
                          <Upload className="h-8 w-8 text-white" />
                        )}
                      </div>
                    </label>
                  ) : (
                    <label 
                      htmlFor="front-photo-input"
                      className="w-full h-80 bg-[hsl(var(--navy-dark))] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-[hsl(var(--navy-dark))]/80 transition-colors"
                    >
                      {isUploadingFront ? (
                        <Loader2 className="h-16 w-16 text-[hsl(var(--silver-base))] animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-16 w-16 text-[hsl(var(--silver-base))]" />
                          <span className="text-[hsl(var(--silver-base))] mt-2 text-sm">Tap to add photo</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--silver-base))] mb-2 font-semibold">Back</p>
                  {card.photo_back_url ? (
                    <label htmlFor="back-photo-input" className="relative cursor-pointer group block">
                      <img
                        src={card.photo_back_url}
                        className="w-full rounded-lg shadow-lg"
                        alt="Card back"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        {isUploadingBack ? (
                          <Loader2 className="h-8 w-8 text-white animate-spin" />
                        ) : (
                          <Upload className="h-8 w-8 text-white" />
                        )}
                      </div>
                    </label>
                  ) : (
                    <label 
                      htmlFor="back-photo-input"
                      className="w-full h-80 bg-[hsl(var(--navy-dark))] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-[hsl(var(--navy-dark))]/80 transition-colors"
                    >
                      {isUploadingBack ? (
                        <Loader2 className="h-16 w-16 text-[hsl(var(--silver-base))] animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-16 w-16 text-[hsl(var(--silver-base))]" />
                          <span className="text-[hsl(var(--silver-base))] mt-2 text-sm">Tap to add photo</span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Information */}
        <Card className="bg-[hsl(var(--navy-light))]/80 border-[hsl(var(--silver-base))]/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-[hsl(var(--silver-light))]">Card Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[hsl(var(--silver-base))]">Player:</span>
                <span className="font-semibold text-white">{card.player_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--silver-base))]">Year:</span>
                <span className="font-semibold text-white">{card.year}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(var(--silver-base))]">From Lot:</span>
                <span className="font-semibold text-white">{card.lots?.source}</span>
              </div>
              {card.lots?.purchase_date && (
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--silver-base))]">Purchase Date:</span>
                  <span className="font-semibold text-white">
                    {format(new Date(card.lots.purchase_date), "MMM dd, yyyy")}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary - Available Status */}
        {card.status === "available" && (
          <Card className="bg-[hsl(var(--navy-light))]/80 border-[hsl(var(--silver-base))]/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--silver-light))]">Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              {card.asking_price ? (
                <div className="text-center py-4">
                  <p className="text-sm text-[hsl(var(--silver-base))] mb-1">Asking Price</p>
                  <p className="text-3xl font-bold text-[hsl(var(--gold-light))]">
                    ${Number(card.asking_price).toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="text-[hsl(var(--silver-base))] text-center py-4">No asking price set</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Record Sale Button - Available Status */}
        {card.status === 'available' && (
          <div className="px-4">
            <Button
              onClick={() => navigate(`/transactions/show-card-sale/${card.id}`)}
              className="w-full bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold uppercase min-h-[44px]"
            >
              RECORD SALE
            </Button>
          </div>
        )}

        {/* Financial Summary - Sold Status */}
        {card.status === "sold" && saleInfo && (
          <Card className="bg-[hsl(var(--navy-light))]/80 border-[hsl(var(--silver-base))]/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--silver-light))]">Sale Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {saleInfo.askingPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--silver-base))]">Asking Price:</span>
                    <span className="font-semibold text-white">${saleInfo.askingPrice.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--silver-base))]">Sale Price:</span>
                  <span className="font-semibold text-[hsl(var(--gold-light))]">
                    ${saleInfo.salePrice.toFixed(2)}
                  </span>
                </div>
                {saleInfo.profit !== null && (
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--silver-base))]">Profit:</span>
                    <span
                      className={`font-semibold ${
                        saleInfo.profit >= 0 ? "text-[hsl(var(--gold-light))]" : "text-red-400"
                      }`}
                    >
                      ${saleInfo.profit.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--silver-base))]">Sold Date:</span>
                  <span className="font-semibold text-white">
                    {format(new Date(saleInfo.saleDate), "MMM dd, yyyy")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transaction History */}
        {card.status === "sold" && transactions.length > 0 && (
          <Collapsible>
            <Card className="bg-[hsl(var(--navy-light))]/80 border-[hsl(var(--silver-base))]/20 backdrop-blur-sm">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-6 hover:bg-[hsl(var(--navy-base))]/50 transition-colors min-h-[44px]">
                <CardTitle className="text-[hsl(var(--silver-light))]">Transaction History</CardTitle>
                <ChevronDown className="h-5 w-5 text-[hsl(var(--silver-base))] transition-transform duration-200 data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="border-b border-[hsl(var(--silver-base))]/20 last:border-0 py-3">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-semibold text-white">
                          {tx.transaction_type === "show_card_sale" ? "Sale" : tx.transaction_type}
                        </span>
                        <span className="text-sm font-semibold text-[hsl(var(--gold-light))]">
                          ${Number(tx.revenue).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-[hsl(var(--silver-base))]">
                        {format(new Date(tx.created_at), "MMM dd, yyyy")}
                      </p>
                      {tx.notes && <p className="text-xs text-[hsl(var(--silver-base))] mt-1">{tx.notes}</p>}
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        </div>
      </div>
    </div>
  );
};

export default ShowCardDetail;
