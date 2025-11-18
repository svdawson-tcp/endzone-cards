import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useMentorView } from "@/contexts/MentorViewContext";
import { useNavigateWithMentorView } from "@/hooks/useNavigateWithMentorView";
import { Package, Calendar, DollarSign, TrendingUp, TrendingDown, Plus, Trash2, CheckCircle2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LotStatus = "active" | "closed" | "archived";
type FilterTab = "all" | LotStatus;
type SortOption = "date-desc" | "date-asc" | "cost-desc" | "cost-asc" | "profit-desc";

interface Lot {
  id: string;
  source: string;
  purchase_date: string;
  total_cost: number;
  status: LotStatus;
  notes: string | null;
  created_at: string;
}

interface LotWithRevenue extends Lot {
  revenue: number;
  net_profit: number;
  roi: number;
}

export default function Lots() {
  const navigate = useNavigate();
  const navigateWithMentorView = useNavigateWithMentorView();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lotToDelete, setLotToDelete] = useState<LotWithRevenue | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [lotToClose, setLotToClose] = useState<LotWithRevenue | null>(null);
  const [unsoldCardCount, setUnsoldCardCount] = useState(0);

  // Use mentor view context
  const { viewingUserId } = useMentorView();

  const getEffectiveUserId = async () => {
    if (viewingUserId) {
      return viewingUserId;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    return user.id;
  };

  // Fetch lots with revenue calculation
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ["lots", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();

      // Fetch lots
      const { data: lotsData, error: lotsError } = await supabase
        .from("lots")
        .select("*")
        .eq("user_id", userId)
        .order("purchase_date", { ascending: false });

      if (lotsError) throw lotsError;

      // Fetch revenue for each lot
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("transactions")
        .select("lot_id, revenue")
        .eq("user_id", userId)
        .not("lot_id", "is", null);

      if (transactionsError) throw transactionsError;

      // Calculate revenue per lot
      const revenueByLot = transactionsData.reduce((acc, transaction) => {
        if (transaction.lot_id) {
          acc[transaction.lot_id] = (acc[transaction.lot_id] || 0) + Number(transaction.revenue);
        }
        return acc;
      }, {} as Record<string, number>);

      // Add revenue and calculate profitability
      const lotsWithRevenue: LotWithRevenue[] = lotsData.map((lot) => {
        const revenue = revenueByLot[lot.id] || 0;
        const net_profit = revenue - Number(lot.total_cost);
        const roi = revenue > 0 ? ((net_profit / Number(lot.total_cost)) * 100) : 0;

        return {
          ...lot,
          status: lot.status as LotStatus,
          revenue,
          net_profit,
          roi,
        };
      });

      return lotsWithRevenue;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (lotId: string) => {
      const { error } = await supabase
        .from("lots")
        .delete()
        .eq("id", lotId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      queryClient.invalidateQueries({ queryKey: ["show_cards"] });
      toast({
        title: "Lot deleted",
        description: "The lot and all associated show cards have been removed",
      });
      setDeleteDialogOpen(false);
      setLotToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting lot",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Filter lots
  const filteredLots = lots.filter((lot) => {
    if (filterTab === "all") return true;
    return lot.status === filterTab;
  });

  // Sort lots
  const sortedLots = [...filteredLots].sort((a, b) => {
    switch (sortOption) {
      case "date-desc":
        return new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime();
      case "date-asc":
        return new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime();
      case "cost-desc":
        return Number(b.total_cost) - Number(a.total_cost);
      case "cost-asc":
        return Number(a.total_cost) - Number(b.total_cost);
      case "profit-desc":
        return b.net_profit - a.net_profit;
      default:
        return 0;
    }
  });

  // Count by status
  const counts = {
    all: lots.length,
    active: lots.filter((l) => l.status === "active").length,
    closed: lots.filter((l) => l.status === "closed").length,
    archived: lots.filter((l) => l.status === "archived").length,
  };

  // Close lot mutation
  const closeLotMutation = useMutation({
    mutationFn: async (lotId: string) => {
      const { error } = await supabase
        .from("lots")
        .update({
          status: "closed",
          closure_date: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", lotId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      toast({
        title: "Lot closed successfully",
        description: "The lot has been marked as closed",
      });
      setCloseDialogOpen(false);
      setLotToClose(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error closing lot",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleCloseLotClick = async (lot: LotWithRevenue) => {
    setLotToClose(lot);

    // Check for unsold show cards
    const { data: unsoldCards, error } = await supabase
      .from("show_cards")
      .select("id")
      .eq("lot_id", lot.id)
      .eq("status", "available");

    if (error) {
      toast({
        title: "Error checking show cards",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      return;
    }

    if (unsoldCards && unsoldCards.length > 0) {
      setUnsoldCardCount(unsoldCards.length);
      setErrorDialogOpen(true);
    } else {
      setCloseDialogOpen(true);
    }
  };

  const handleCloseConfirm = () => {
    if (lotToClose) {
      closeLotMutation.mutate(lotToClose.id);
    }
  };

  const handleDeleteClick = (lot: LotWithRevenue) => {
    setLotToDelete(lot);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (lotToDelete) {
      deleteMutation.mutate(lotToDelete.id);
    }
  };

  const getStatusBadgeVariant = (status: LotStatus) => {
    switch (status) {
      case "active":
        return "default";
      case "closed":
        return "outline";
      case "archived":
        return "secondary";
      default:
        return "secondary";
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--bg-page))]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
          <div>
            {/* Page Title - Uses page-title class with EndZone design system */}
            <h1 className="page-title text-[hsl(var(--text-primary))] mb-2">LOTS</h1>
            <p className="text-muted-foreground">Track your inventory purchases</p>
          </div>
          <Button
            onClick={() => navigateWithMentorView("/lots/new")}
            className="bg-[#041E42] hover:bg-[#0A2E63] text-white font-semibold uppercase self-start md:self-auto"
          >
            <Plus className="mr-2 h-5 w-5" />
            CREATE LOT
          </Button>
        </div>

        {/* Filter Tabs and Sort */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2 flex-1">
            <Button
              variant={filterTab === "all" ? "default" : "outline"}
              onClick={() => setFilterTab("all")}
            >
              All ({counts.all})
            </Button>
            <Button
              variant={filterTab === "active" ? "default" : "outline"}
              onClick={() => setFilterTab("active")}
            >
              Active ({counts.active})
            </Button>
            <Button
              variant={filterTab === "closed" ? "default" : "outline"}
              onClick={() => setFilterTab("closed")}
            >
              Closed ({counts.closed})
            </Button>
            <Button
              variant={filterTab === "archived" ? "default" : "outline"}
              onClick={() => setFilterTab("archived")}
            >
              Archived ({counts.archived})
            </Button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
              <SelectTrigger className="w-auto min-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (Newest First)</SelectItem>
                <SelectItem value="date-asc">Date (Oldest First)</SelectItem>
                <SelectItem value="cost-desc">Cost (High to Low)</SelectItem>
                <SelectItem value="cost-asc">Cost (Low to High)</SelectItem>
                <SelectItem value="profit-desc">Profitability</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading lots...</p>
          </div>
        )}

        {/* Empty State - No Lots */}
        {!isLoading && lots.length === 0 && (
          <div className="bg-card shadow-card-shadow rounded-lg p-12 text-center">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-h2 mb-2">No lots yet</h2>
            <p className="text-muted-foreground mb-6">Create your first lot to start tracking purchases</p>
            <Button
              onClick={() => navigateWithMentorView("/lots/new")}
              className="bg-[#041E42] hover:bg-[#0A2E63] text-white font-semibold uppercase"
            >
              <Plus className="mr-2 h-5 w-5" />
              CREATE LOT
            </Button>
          </div>
        )}

        {/* Empty State - Filtered View */}
        {!isLoading && lots.length > 0 && sortedLots.length === 0 && (
          <div className="bg-card shadow-card-shadow rounded-lg p-12 text-center">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-h2 mb-2">No {filterTab} lots found</h2>
            <p className="text-muted-foreground">Try selecting a different filter</p>
          </div>
        )}

        {/* Lots Grid */}
        {!isLoading && sortedLots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedLots.map((lot) => (
              <div
                key={lot.id}
                className="bg-card border border-[hsl(var(--border-default))] shadow-card-shadow rounded-lg p-6 relative hover:shadow-lg transition-shadow"
              >
                {/* Status Badge */}
                <div className="absolute top-4 right-4">
                  <Badge variant={getStatusBadgeVariant(lot.status)}>
                    {lot.status}
                  </Badge>
                </div>

                {/* Lot Source */}
                <h3 className="text-h3 mb-4 pr-20">{lot.source}</h3>

                {/* Lot Details */}
                <div className="space-y-3 mb-4">
                  {/* Purchase Date */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-[hsl(var(--text-body))]">
                    {format(new Date(lot.purchase_date), "MMM dd, yyyy")}
                  </span>
                  </div>

                  {/* Cost */}
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-[hsl(var(--text-body))]">
                      Cost: ${Number(lot.total_cost).toFixed(2)}
                    </span>
                  </div>

                  {/* Revenue (if > 0) */}
                  {lot.revenue > 0 && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-[hsl(var(--text-body))]">
                        Revenue: ${lot.revenue.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* Net Profit/Loss */}
                  <div className="flex items-center gap-2">
                    {lot.net_profit >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-[hsl(var(--metric-positive))]" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-[hsl(var(--metric-negative))]" />
                    )}
                    <span className={`text-sm font-semibold ${
                      lot.net_profit >= 0 ? "text-[hsl(var(--metric-positive))]" : "text-[hsl(var(--metric-negative))]"
                    }`}>
                      Net: ${lot.net_profit.toFixed(2)}
                    </span>
                  </div>

                  {/* ROI (if revenue > 0) */}
                  {lot.revenue > 0 && (
                    <div className="text-sm text-muted-foreground">
                      ROI: {lot.roi.toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* Notes Preview */}
                {lot.notes && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {lot.notes}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-4 border-t border-border">
                  <Button
                    onClick={() => navigateWithMentorView(`/lots/${lot.id}`)}
                    variant="outline"
                    className="w-full"
                  >
                    VIEW DETAILS
                  </Button>
                  <Button
                    onClick={() => navigateWithMentorView(`/show-cards/new?lot_id=${lot.id}`)}
                    className="w-full bg-[#041E42] hover:bg-[#0A2E63] text-white font-semibold uppercase"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    ADD SHOW CARD
                  </Button>
                  {lot.status === "active" && (
                    <Button
                      variant="outline"
                      onClick={() => handleCloseLotClick(lot)}
                      className="w-full"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      CLOSE LOT
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigateWithMentorView(`/lots/${lot.id}/edit`)}
                    >
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(lot)}
                      className="!text-red-600 hover:!bg-red-600 hover:!text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lot?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete lot "{lotToDelete?.source}"? This will also delete all associated show cards. This action cannot be undone.
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

      {/* Close Lot Error Dialog */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Cannot Close Lot</AlertDialogTitle>
            <AlertDialogDescription>
              This lot has {unsoldCardCount} unsold show card{unsoldCardCount !== 1 ? "s" : ""}. You must sell, transfer, or mark them as lost before closing this lot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setErrorDialogOpen(false)}
              className="bg-destructive hover:bg-destructive/90"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close Lot Confirmation Dialog */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Lot?</AlertDialogTitle>
            <AlertDialogDescription>
              Have you accounted for all cards through sales, dispositions, or combinations? This will mark lot "{lotToClose?.source}" as closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCloseConfirm}
              className="bg-[#041E42] hover:bg-[#0A2E63] text-white"
            >
              Close Lot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
