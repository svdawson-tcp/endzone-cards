import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
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
import { PageContainer } from "@/components/layout/AppLayout";

type LotStatus = "active" | "closed" | "archived";
type FilterTab = "all" | LotStatus;

interface Lot {
  id: string;
  created_at: string;
  user_id: string;
  source: string;
  purchase_date: string;
  total_cost: number;
  status: LotStatus;
  notes?: string;
  totalRevenue?: number;
  profit?: number;
}

interface Transaction {
  id: string;
  created_at: string;
  user_id: string;
  lot_id: string;
  show_card_id?: string;
  date: string;
  type: "sale" | "expense" | "cash_deposit" | "cash_withdrawal" | "cash_adjustment";
  description: string;
  revenue: number;
  cost: number;
  payment_type: "cash" | "card" | "check" | "other";
  notes?: string;
  deleted?: boolean;
}

export default function Lots() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lotToDelete, setLotToDelete] = useState<any>(null);
  const { getEffectiveUserId, isViewingAsMentor } = useMentorAccess();

  const { data: lots = [], isLoading: lotsLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("user_id", userId)
        .order("purchase_date", { ascending: false });

      if (error) throw error;

      const lotsWithRevenue = await Promise.all(
        (data || []).map(async (lot) => {
          const { data: revenue } = await supabase
            .from("transactions")
            .select("revenue")
            .eq("lot_id", lot.id)
            .not("deleted", "eq", true);

          const totalRevenue = revenue?.reduce((sum, t) => sum + (t.revenue || 0), 0) || 0;
          const profit = totalRevenue - lot.total_cost;

          return { ...lot, totalRevenue, profit };
        })
      );

      return lotsWithRevenue;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (lotId: string) => {
      const { error } = await supabase.from("lots").delete().eq("id", lotId);
      if (error) {
        // Check for FK constraint violation (show cards exist)
        if (error.code === '23503') {
          toast({
            title: "Cannot delete lot",
            description: "Show cards still exist. Please remove or reassign all show cards first.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error deleting lot",
            description: error.message || "Please try again",
            variant: "destructive",
          });
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      toast({
        title: "Lot deleted",
        description: "The lot and all associated show cards have been removed",
      });
      setDeleteDialogOpen(false);
      setLotToDelete(null);
    },
    onError: () => {
      // Error already handled in mutationFn
    },
  });

  const filteredLots = lots.filter((lot) => {
    if (filterTab === "all") return true;
    return lot.status === filterTab;
  });

  const counts = {
    all: lots.length,
    active: lots.filter((l) => l.status === "active").length,
    closed: lots.filter((l) => l.status === "closed").length,
    archived: lots.filter((l) => l.status === "archived").length,
  };

  const handleDeleteClick = (lot: any) => {
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
    <PageContainer maxWidth="7xl">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="page-title text-[hsl(var(--text-primary))] mb-2">LOTS</h1>
            <p className="text-muted-foreground">Track your inventory purchases</p>
          </div>
          <Button
            onClick={() => navigate("/lots/new")}
            className="bg-[#041E42] hover:bg-[#0A2E63] text-white font-semibold uppercase self-start md:self-auto"
            disabled={isViewingAsMentor}
          >
            <Plus className="mr-2 h-4 w-4" />
            CREATE LOT
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {(["all", "active", "closed", "archived"] as const).map((tab) => (
            <Button
              key={tab}
              variant={filterTab === tab ? "default" : "outline"}
              onClick={() => setFilterTab(tab as FilterTab)}
              className="flex-shrink-0 capitalize"
            >
              {tab === "all" ? "All" : tab}
              <Badge variant="secondary" className="ml-2">
                {counts[tab]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {lotsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading lots...</div>
        </div>
      ) : filteredLots.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {filterTab === "all" ? "No lots created yet" : `No ${filterTab} lots found`}
          </p>
          {filterTab === "all" && (
            <Button onClick={() => navigate("/lots/new")} className="mt-4" disabled={isViewingAsMentor}>
              Create your first lot
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredLots.map((lot) => (
            <div
              key={lot.id}
              className="bg-card rounded-lg shadow-card-shadow p-6 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/lots/${lot.id}`)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-lg text-foreground">{lot.source}</h3>
                  </div>
                  <Badge variant={getStatusBadgeVariant(lot.status as LotStatus)} className="capitalize">
                    {lot.status}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{format(new Date(lot.purchase_date), "MMM d, yyyy")}</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-muted-foreground">Cost:</span>
                  <span className="font-semibold text-foreground">${lot.total_cost.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Revenue:</span>
                  <span className="font-semibold text-foreground">${lot.totalRevenue.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-medium text-foreground">Profit:</span>
                  <div className="flex items-center gap-1">
                    {lot.profit >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`font-bold ${lot.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                      ${Math.abs(lot.profit).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {!isViewingAsMentor && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-border" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/lots/${lot.id}/edit`)} className="flex-1">
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(lot)} className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{lotToDelete?.source}" and all associated show cards.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">
              Delete Lot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
