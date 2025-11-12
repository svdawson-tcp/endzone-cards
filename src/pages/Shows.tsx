import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Calendar, MapPin, DollarSign, Edit, Trash2, Plus } from "lucide-react";
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

type ShowStatus = "planned" | "active" | "completed";
type FilterTab = "all" | ShowStatus;
type SortOption = "date-asc" | "date-desc" | "name-asc";

interface Show {
  id: string;
  name: string;
  show_date: string;
  location: string | null;
  table_cost: number;
  booth_number: string | null;
  status: ShowStatus;
  notes: string | null;
  created_at: string;
  revenue?: number;
  expenses?: number;
}

export default function Shows() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-asc");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showToDelete, setShowToDelete] = useState<Show | null>(null);

  // Fetch shows with revenue and expenses
  const { data: shows = [], isLoading } = useQuery({
    queryKey: ["shows"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: showsData, error } = await supabase
        .from("shows")
        .select("*")
        .eq("user_id", user.id)
        .order("show_date", { ascending: true });

      if (error) throw error;

      // Fetch revenue and expenses for each show
      const showsWithMetrics = await Promise.all(
        showsData.map(async (show) => {
          // Fetch revenue from transactions
          const { data: revenueData } = await supabase
            .from("transactions")
            .select("revenue")
            .eq("show_id", show.id);

          const revenue = revenueData?.reduce((sum, t) => sum + (t.revenue || 0), 0) || 0;

          // Fetch expenses
          const { data: expensesData } = await supabase
            .from("expenses")
            .select("amount")
            .eq("show_id", show.id);

          const expenses = expensesData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

          return {
            ...show,
            revenue,
            expenses,
          } as Show;
        })
      );

      return showsWithMetrics;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (showId: string) => {
      const { error } = await supabase
        .from("shows")
        .delete()
        .eq("id", showId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows"] });
      toast({
        title: "Show deleted",
        description: "The show has been removed successfully",
      });
      setDeleteDialogOpen(false);
      setShowToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting show",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Status change mutation with validation
  const statusChangeMutation = useMutation({
    mutationFn: async ({ showId, newStatus }: { showId: string; newStatus: ShowStatus }) => {
      // Step 1: If changing to "planned", validate no linked data
      if (newStatus === "planned") {
        // Check for transactions
        const { count: txCount, error: txError } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("show_id", showId);

        if (txError) throw txError;

        // Check for expenses  
        const { count: expCount, error: expError } = await supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("show_id", showId);

        if (expError) throw expError;

        // Block if any linked data exists
        if ((txCount || 0) > 0 || (expCount || 0) > 0) {
          throw new Error(
            `Cannot revert to Planned - this show has ${txCount || 0} transaction(s) and ${expCount || 0} expense(s) recorded. Shows with financial records cannot be reverted.`
          );
        }
      }

      // Step 2: Update status
      const { error } = await supabase
        .from("shows")
        .update({ status: newStatus })
        .eq("id", showId);

      if (error) throw error;

      return { showId, newStatus };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["shows"] });
      toast({
        title: "Status updated",
        description: `Show status changed to ${data.newStatus}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cannot change status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter shows
  const filteredShows = shows.filter((show) => {
    if (filterTab === "all") return true;
    return show.status === filterTab;
  });

  // Sort shows
  const sortedShows = [...filteredShows].sort((a, b) => {
    switch (sortOption) {
      case "date-asc":
        return new Date(a.show_date).getTime() - new Date(b.show_date).getTime();
      case "date-desc":
        return new Date(b.show_date).getTime() - new Date(a.show_date).getTime();
      case "name-asc":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  // Count by status
  const counts = {
    all: shows.length,
    planned: shows.filter((s) => s.status === "planned").length,
    active: shows.filter((s) => s.status === "active").length,
    completed: shows.filter((s) => s.status === "completed").length,
  };

  const handleDeleteClick = (show: Show) => {
    setShowToDelete(show);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (showToDelete) {
      deleteMutation.mutate(showToDelete.id);
    }
  };

  const handleStatusChange = (showId: string, newStatus: ShowStatus) => {
    statusChangeMutation.mutate({ showId, newStatus });
  };

  const getStatusBadgeVariant = (status: ShowStatus) => {
    switch (status) {
      case "planned":
        return "secondary";
      case "active":
        return "default";
      case "completed":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-h1 mb-2">SHOWS</h1>
            <p className="text-muted-foreground">Manage your card show events</p>
          </div>
          <Button
            onClick={() => navigate("/shows/new")}
            className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold uppercase self-start md:self-auto"
          >
            <Plus className="mr-2 h-5 w-5" />
            CREATE SHOW
          </Button>
        </div>

        {/* Filter Tabs and Sort */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2 flex-1">
          <Button
            variant={filterTab === "all" ? "default" : "outline"}
            onClick={() => setFilterTab("all")}
            className={filterTab === "all" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            All ({counts.all})
          </Button>
          <Button
            variant={filterTab === "planned" ? "default" : "outline"}
            onClick={() => setFilterTab("planned")}
            className={filterTab === "planned" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Planned ({counts.planned})
          </Button>
          <Button
            variant={filterTab === "active" ? "default" : "outline"}
            onClick={() => setFilterTab("active")}
            className={filterTab === "active" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Active ({counts.active})
          </Button>
          <Button
            variant={filterTab === "completed" ? "default" : "outline"}
            onClick={() => setFilterTab("completed")}
            className={filterTab === "completed" ? "bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))]" : ""}
          >
            Completed ({counts.completed})
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
                <SelectItem value="date-asc">Date (Oldest First)</SelectItem>
                <SelectItem value="date-desc">Date (Newest First)</SelectItem>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading shows...</p>
          </div>
        )}

        {/* Empty State - No Shows */}
        {!isLoading && shows.length === 0 && (
          <div className="bg-card shadow-card-shadow rounded-lg p-12 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-h2 mb-2">No shows yet</h2>
            <p className="text-muted-foreground mb-6">Create your first show to get started</p>
            <Button
              onClick={() => navigate("/shows/new")}
              className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold uppercase"
            >
              <Plus className="mr-2 h-5 w-5" />
              CREATE SHOW
            </Button>
          </div>
        )}

        {/* Empty State - Filtered View */}
        {!isLoading && shows.length > 0 && sortedShows.length === 0 && (
          <div className="bg-card shadow-card-shadow rounded-lg p-12 text-center">
            <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-h2 mb-2">No {filterTab} shows found</h2>
            <p className="text-muted-foreground">Try selecting a different filter</p>
          </div>
        )}

        {/* Shows Grid */}
        {!isLoading && sortedShows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedShows.map((show) => (
              <div
                key={show.id}
                className="bg-card shadow-card-shadow rounded-lg p-6 relative hover:shadow-lg transition-shadow"
              >
                {/* Status Badge */}
                <div className="absolute top-4 right-4">
                  <Badge variant={getStatusBadgeVariant(show.status)}>
                    {show.status}
                  </Badge>
                </div>

                {/* Show Name */}
                <h3 className="text-h3 text-gray-900 mb-4 pr-20">{show.name}</h3>

                {/* Show Details */}
                <div className="space-y-3 mb-4">
                  {/* Date */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-gray-900">
                      {format(new Date(show.show_date), "MMM dd, yyyy")}
                    </span>
                  </div>

                  {/* Location */}
                  {show.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-gray-900">{show.location}</span>
                    </div>
                  )}

                  {/* Table Cost */}
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-gray-900">
                      Table Cost: ${show.table_cost.toFixed(2)}
                    </span>
                  </div>

                  {/* Booth Number */}
                  {show.booth_number && (
                    <div className="text-sm text-muted-foreground">
                      Booth: {show.booth_number}
                    </div>
                  )}
                </div>

                {/* Notes Preview */}
                {show.notes && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {show.notes}
                  </p>
                )}

                {/* Profitability Section - Only for Active and Completed Shows */}
                {(show.status === "active" || show.status === "completed") && (
                  <div className="border-t border-border pt-4 mt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Profitability
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs text-muted-foreground">Revenue</div>
                        <div className="text-sm font-semibold text-green-600">
                          ${(show.revenue || 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Expenses</div>
                        <div className="text-sm font-semibold text-destructive">
                          ${((show.expenses || 0) + show.table_cost).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Net</div>
                        <div className={`text-sm font-semibold ${
                          ((show.revenue || 0) - (show.expenses || 0) - show.table_cost) >= 0 
                            ? 'text-green-600' 
                            : 'text-destructive'
                        }`}>
                          ${((show.revenue || 0) - (show.expenses || 0) - show.table_cost).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    
                    {/* ROI for Completed Shows */}
                    {show.status === "completed" && (
                      <div className="text-xs text-center mt-2 text-muted-foreground">
                        ROI: {(
                          ((show.revenue || 0) - (show.expenses || 0) - show.table_cost) / 
                          ((show.expenses || 0) + show.table_cost || 1) * 100
                        ).toFixed(1)}%
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-4 border-t border-border">
                  {/* Status Change Buttons */}
                  {show.status === "planned" && (
                    <Button
                      size="sm"
                      className="w-full bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold"
                      onClick={() => statusChangeMutation.mutate({ showId: show.id, newStatus: "active" })}
                      disabled={statusChangeMutation.isPending}
                    >
                      START SHOW
                    </Button>
                  )}
                  
                  {show.status === "active" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => statusChangeMutation.mutate({ showId: show.id, newStatus: "planned" })}
                        disabled={statusChangeMutation.isPending}
                      >
                        ← Revert to Planned
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold"
                        onClick={() => statusChangeMutation.mutate({ showId: show.id, newStatus: "completed" })}
                        disabled={statusChangeMutation.isPending}
                      >
                        CLOSE SHOW
                      </Button>
                    </div>
                  )}

                  {/* View Details, Edit and Delete Buttons - always visible */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/shows/${show.id}`)}
                    >
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate(`/shows/${show.id}/edit`)}
                    >
                      <Edit className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(show)}
                      className="text-destructive hover:text-destructive"
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
            <AlertDialogTitle>Delete Show?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{showToDelete?.name}"? This action cannot be undone.
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
  );
}
