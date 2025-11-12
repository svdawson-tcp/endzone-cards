import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Trash2, Package, DollarSign, Calendar, Image as ImageIcon, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";

type CardStatus = "available" | "sold" | "lost" | "combined";
type FilterTab = "all" | CardStatus;
type SortOption = "date_desc" | "date_asc" | "player_asc" | "price_desc" | "price_asc";

interface ShowCard {
  id: string;
  user_id: string;
  lot_id: string;
  player_name: string;
  year: string | null;
  photo_front_url: string | null;
  photo_back_url: string | null;
  asking_price: number | null;
  cost_basis: number | null;
  status: CardStatus;
  created_at: string;
  updated_at: string;
  lots: {
    source: string;
  } | null;
  sale_price?: number | null;
}

export default function ShowCards() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date_desc");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<ShowCard | null>(null);

  // Fetch show cards with lot info
  const { data: showCards = [], isLoading } = useQuery({
    queryKey: ["show_cards"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch show cards with lot info
      const { data: cards, error } = await supabase
        .from("show_cards")
        .select("*, lots!lot_id(source)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch sale prices for sold cards
      const cardsWithSales = await Promise.all(
        (cards || []).map(async (card) => {
          if (card.status === "sold") {
            const { data: transaction } = await supabase
              .from("transactions")
              .select("revenue")
              .eq("show_card_id", card.id)
              .maybeSingle();
            
            return { ...card, sale_price: transaction?.revenue || null };
          }
          return card;
        })
      );

      return cardsWithSales as ShowCard[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase
        .from("show_cards")
        .delete()
        .eq("id", cardId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show_cards"] });
      toast({
        title: "Show card deleted",
        description: "The show card has been removed from your inventory.",
      });
      setDeleteDialogOpen(false);
      setCardToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error deleting show card",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (card: ShowCard) => {
    setCardToDelete(card);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (cardToDelete) {
      deleteMutation.mutate(cardToDelete.id);
    }
  };

  const getStatusBadgeVariant = (status: CardStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "available":
        return "default";
      case "sold":
        return "outline";
      case "lost":
        return "destructive";
      case "combined":
        return "secondary";
      default:
        return "default";
    }
  };

  // Filter cards
  const filteredCards = showCards.filter((card) => {
    if (filterTab === "all") return true;
    return card.status === filterTab;
  });

  // Sort cards
  const sortedCards = [...filteredCards].sort((a, b) => {
    switch (sortOption) {
      case "date_desc":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "date_asc":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "player_asc":
        return a.player_name.localeCompare(b.player_name);
      case "price_desc":
        return (b.asking_price || 0) - (a.asking_price || 0);
      case "price_asc":
        return (a.asking_price || 0) - (b.asking_price || 0);
      default:
        return 0;
    }
  });

  // Calculate counts for filter tabs
  const allCount = showCards.length;
  const availableCount = showCards.filter(c => c.status === "available").length;
  const soldCount = showCards.filter(c => c.status === "sold").length;
  const lostCount = showCards.filter(c => c.status === "lost").length;
  const combinedCount = showCards.filter(c => c.status === "combined").length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[hsl(var(--navy-base))]"></div>
          <p className="mt-4 text-gray-900">Loading show cards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            {/* Page Title - Uses page-title class for white text on dark background */}
            <h1 className="page-title mb-2">SHOW CARDS</h1>
            <p className="text-muted-foreground">Track your premium inventory</p>
          </div>
          <Button
            onClick={() => navigate("/show-cards/new")}
            className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
          >
            <Plus className="h-4 w-4" />
            CREATE SHOW CARD
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={filterTab === "all" ? "default" : "outline"}
            onClick={() => setFilterTab("all")}
            className={filterTab === "all" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            All ({allCount})
          </Button>
          <Button
            variant={filterTab === "available" ? "default" : "outline"}
            onClick={() => setFilterTab("available")}
            className={filterTab === "available" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Available ({availableCount})
          </Button>
          <Button
            variant={filterTab === "sold" ? "default" : "outline"}
            onClick={() => setFilterTab("sold")}
            className={filterTab === "sold" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Sold ({soldCount})
          </Button>
          <Button
            variant={filterTab === "lost" ? "default" : "outline"}
            onClick={() => setFilterTab("lost")}
            className={filterTab === "lost" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Lost ({lostCount})
          </Button>
          <Button
            variant={filterTab === "combined" ? "default" : "outline"}
            onClick={() => setFilterTab("combined")}
            className={filterTab === "combined" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Combined ({combinedCount})
          </Button>
        </div>

        {/* Sort Dropdown */}
        <div className="mb-6">
          <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
            <SelectTrigger className="w-full sm:w-64 bg-white text-gray-900">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Date (Newest First)</SelectItem>
              <SelectItem value="date_asc">Date (Oldest First)</SelectItem>
              <SelectItem value="player_asc">Player (A-Z)</SelectItem>
              <SelectItem value="price_desc">Price (High to Low)</SelectItem>
              <SelectItem value="price_asc">Price (Low to High)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Empty States */}
        {showCards.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No show cards yet</h3>
            <p className="text-muted-foreground mb-6">
              Start tracking your premium inventory by creating your first show card
            </p>
            <Button
              onClick={() => navigate("/show-cards/new")}
              className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
            >
              <Plus className="h-4 w-4" />
              CREATE SHOW CARD
            </Button>
          </div>
        ) : sortedCards.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No {filterTab} cards found
            </h3>
            <p className="text-muted-foreground">
              Try selecting a different filter or create a new show card
            </p>
          </div>
        ) : (
          /* Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedCards.map((card) => (
              <div key={card.id} className="bg-card shadow-card-shadow rounded-lg p-6 relative">
                {/* Status Badge */}
                <div className="absolute top-4 right-4">
                  <Badge 
                    variant={getStatusBadgeVariant(card.status)}
                  >
                    {card.status.toUpperCase()}
                  </Badge>
                </div>

                {/* Photo */}
                {card.photo_front_url ? (
                  <img
                    src={card.photo_front_url}
                    alt={`${card.player_name} card`}
                    className="w-full max-h-48 object-cover rounded mb-4"
                  />
                ) : (
                  <div className="w-full h-48 bg-muted rounded mb-4 flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}

                {/* Player & Year */}
                <h3 className="text-h3 text-gray-900 mb-4">
                  {card.player_name} {card.year && `(${card.year})`}
                </h3>

                {/* Card Details */}
                <div className="space-y-2 text-sm mb-4">
                  {/* From Lot */}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>From Lot: {card.lots?.source || "Unknown"}</span>
                  </div>

                  {/* Created Date */}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{format(new Date(card.created_at), "MMM dd, yyyy")}</span>
                  </div>

                  {/* Asking Price */}
                  {card.asking_price !== null && (
                    <div className="flex items-center gap-2 text-gray-900">
                      <DollarSign className="h-4 w-4" />
                      <span>Asking: ${Number(card.asking_price).toFixed(2)}</span>
                    </div>
                  )}

                  {/* Sale Price (if sold) */}
                  {card.status === "sold" && card.sale_price !== null && (
                    <div className="flex items-center gap-2 text-[hsl(var(--success))] font-semibold">
                      <DollarSign className="h-4 w-4" />
                      <span>Sold: ${Number(card.sale_price).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t border-border">
                  {card.status === "available" && (
                    <Button 
                      className="flex-1 bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
                      onClick={() => navigate(`/transactions/show-card-sale/${card.id}`, { state: { showCard: card } })}
                    >
                      <DollarSign className="mr-1 h-4 w-4" />
                      SELL
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => navigate(`/show-cards/${card.id}/edit`)}
                  >
                    <Edit className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDeleteClick(card)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Show Card?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {cardToDelete?.player_name}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
