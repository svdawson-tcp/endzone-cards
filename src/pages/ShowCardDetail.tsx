import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
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
  const { getEffectiveUserId } = useMentorAccess();
  const [isFlipped, setIsFlipped] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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

  if (cardLoading) {
    return (
      <div className="bg-slate-100 flex items-center justify-center">
        <div className="text-muted-foreground">Loading card details...</div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="bg-slate-100 flex items-center justify-center">
        <div className="text-muted-foreground">Card not found</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-100">
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
        <Card>
          <CardHeader>
            <CardTitle className="card-title">Card Photos</CardTitle>
          </CardHeader>
          <CardContent>
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
                        <img
                          src={card.photo_front_url}
                          className="w-full rounded-lg shadow-lg"
                          alt="Card front"
                        />
                      ) : (
                        <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center">
                          <ImageIcon className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 bg-black/60 rounded-full p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <RotateCw className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-center text-sm text-gray-600 mt-2">Front • Tap to flip</p>
                    </div>
                  ) : (
                    <div className="relative">
                      {card.photo_back_url ? (
                        <img
                          src={card.photo_back_url}
                          className="w-full rounded-lg shadow-lg"
                          alt="Card back"
                        />
                      ) : (
                        <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center">
                          <ImageIcon className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 bg-black/60 rounded-full p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <RotateCcw className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-center text-sm text-gray-600 mt-2">Back • Tap to flip</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Desktop/Tablet: Side by side photos
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-2 font-semibold">Front</p>
                  {card.photo_front_url ? (
                    <img
                      src={card.photo_front_url}
                      className="w-full rounded-lg shadow-lg"
                      alt="Card front"
                    />
                  ) : (
                    <div className="w-full h-80 bg-muted rounded-lg flex items-center justify-center">
                      <ImageIcon className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2 font-semibold">Back</p>
                  {card.photo_back_url ? (
                    <img
                      src={card.photo_back_url}
                      className="w-full rounded-lg shadow-lg"
                      alt="Card back"
                    />
                  ) : (
                    <div className="w-full h-80 bg-muted rounded-lg flex items-center justify-center">
                      <ImageIcon className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card Information */}
        <Card>
          <CardHeader>
            <CardTitle className="card-title">Card Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Player:</span>
                <span className="font-semibold text-gray-900">{card.player_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Year:</span>
                <span className="font-semibold text-gray-900">{card.year}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">From Lot:</span>
                <span className="font-semibold text-gray-900">{card.lots?.source}</span>
              </div>
              {card.lots?.purchase_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Purchase Date:</span>
                  <span className="font-semibold text-gray-900">
                    {format(new Date(card.lots.purchase_date), "MMM dd, yyyy")}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary - Available Status */}
        {card.status === "available" && (
          <Card>
            <CardHeader>
              <CardTitle className="card-title">Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              {card.asking_price ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-1">Asking Price</p>
                  <p className="text-3xl font-bold text-green-600">
                    ${Number(card.asking_price).toFixed(2)}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No asking price set</p>
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
          <Card>
            <CardHeader>
              <CardTitle className="card-title">Sale Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {saleInfo.askingPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Asking Price:</span>
                    <span className="font-semibold">${saleInfo.askingPrice.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Sale Price:</span>
                  <span className="font-semibold text-green-600">
                    ${saleInfo.salePrice.toFixed(2)}
                  </span>
                </div>
                {saleInfo.profit !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Profit:</span>
                    <span
                      className={`font-semibold ${
                        saleInfo.profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ${saleInfo.profit.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Sold Date:</span>
                  <span className="font-semibold">
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
            <Card>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-6 hover:bg-accent/50 transition-colors min-h-[44px]">
                <CardTitle className="card-title">Transaction History</CardTitle>
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="border-b last:border-0 py-3">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {tx.transaction_type === "show_card_sale" ? "Sale" : tx.transaction_type}
                        </span>
                        <span className="text-sm font-semibold text-green-600">
                          ${Number(tx.revenue).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {format(new Date(tx.created_at), "MMM dd, yyyy")}
                      </p>
                      {tx.notes && <p className="text-xs text-gray-600 mt-1">{tx.notes}</p>}
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

      </div>
    </div>
  );
};

export default ShowCardDetail;
