import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { 
  ArrowLeft, 
  Edit,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Package,
  ChevronDown,
  ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import AuthenticatedLayout from "@/components/Layout/AuthenticatedLayout";

const LotDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // Fetch lot details
  const { data: lot, isLoading: lotLoading } = useQuery({
    queryKey: ["lot", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("lots")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch show cards
  const { data: showCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ["lot-show-cards", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("show_cards")
        .select("*")
        .eq("lot_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch transactions
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["lot-transactions", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("lot_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch dispositions
  const { data: dispositions = [], isLoading: dispositionsLoading } = useQuery({
    queryKey: ["lot-dispositions", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("lot_id", id)
        .eq("transaction_type", "disposition")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Financial calculations
  const financials = useMemo(() => {
    const showCardRevenue = transactions
      .filter(t => t.transaction_type === "show_card_sale")
      .reduce((sum, t) => sum + Number(t.revenue || 0), 0);
    
    const bulkRevenue = transactions
      .filter(t => t.transaction_type === "bulk_sale")
      .reduce((sum, t) => sum + Number(t.revenue || 0), 0);
    
    const totalRevenue = showCardRevenue + bulkRevenue;
    const costBasis = Number(lot?.total_cost || 0);
    const netProfit = totalRevenue - costBasis;
    const roi = costBasis > 0 ? ((netProfit / costBasis) * 100) : 0;

    const showCardSalesCount = transactions.filter(t => t.transaction_type === "show_card_sale").length;
    const bulkSalesCount = transactions.filter(t => t.transaction_type === "bulk_sale").length;

    return {
      showCardRevenue,
      bulkRevenue,
      totalRevenue,
      costBasis,
      netProfit,
      roi,
      showCardSalesCount,
      bulkSalesCount,
    };
  }, [transactions, lot]);

  // Sale price lookup map
  const salePriceMap = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter(t => t.transaction_type === "show_card_sale" && t.show_card_id)
      .forEach(t => {
        map.set(t.show_card_id, Number(t.revenue || 0));
      });
    return map;
  }, [transactions]);

  // Group show cards by status
  const cardsByStatus = useMemo(() => {
    const available = showCards.filter(c => c.status === "available");
    const sold = showCards.filter(c => c.status === "sold");
    const other = showCards.filter(c => c.status !== "available" && c.status !== "sold");
    
    return { available, sold, other };
  }, [showCards]);

  // Closure logic
  const canClose = cardsByStatus.available.length === 0;

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: async ({ lotId, newStatus }: { lotId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("lots")
        .update({ status: newStatus })
        .eq("id", lotId);
      
      if (error) throw error;
      return { lotId, newStatus };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["lot", id] });
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      toast({
        title: "Status Updated",
        description: `Lot ${data.newStatus === "closed" ? "closed" : "reopened"} successfully.`,
      });
      setShowCloseDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update lot status. Please try again.",
        variant: "destructive",
      });
      console.error("Status update error:", error);
    },
  });

  const handleCloseLot = () => {
    if (lot?.id) {
      statusMutation.mutate({ lotId: lot.id, newStatus: "closed" });
    }
  };

  const handleReopenLot = () => {
    if (lot?.id) {
      statusMutation.mutate({ lotId: lot.id, newStatus: "active" });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "closed": return "outline";
      default: return "secondary";
    }
  };

  const isLoading = lotLoading || cardsLoading || transactionsLoading || dispositionsLoading;

  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (!lot) {
    return (
      <AuthenticatedLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Lot not found</div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/lots")}
              className="min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="page-title">{lot.source}</h1>
              <p className="text-sm text-muted-foreground">
                Purchased {format(new Date(lot.purchase_date), "MMM dd, yyyy")}
              </p>
            </div>
            <Badge variant={getStatusBadgeVariant(lot.status)}>
              {lot.status}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(`/lots/${id}/edit`)}
              className="min-h-[44px] min-w-[44px]"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {lot.status === "active" && (
            <Button
              onClick={() => canClose ? setShowCloseDialog(true) : null}
              disabled={!canClose}
              className={`min-h-[44px] ${!canClose ? "opacity-50" : ""}`}
              variant={canClose ? "default" : "outline"}
            >
              {canClose ? "CLOSE LOT" : `CANNOT CLOSE - ${cardsByStatus.available.length} CARDS AVAILABLE`}
            </Button>
          )}
          {lot.status === "closed" && (
            <Button
              onClick={handleReopenLot}
              variant="outline"
              className="min-h-[44px]"
            >
              REOPEN LOT
            </Button>
          )}
        </div>
        {!canClose && (
          <p className="text-sm text-muted-foreground">
            Cannot close - {cardsByStatus.available.length} show card(s) still available. Sell, transfer, or mark as lost first.
          </p>
        )}

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">Total Revenue</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                ${financials.totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {financials.showCardSalesCount} premium + {financials.bulkSalesCount} bulk sales
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="h-5 w-5 text-[hsl(var(--navy-base))]" />
                <span className="text-sm font-medium">Cost Basis</span>
              </div>
              <div className="text-2xl font-bold text-[hsl(var(--navy-base))]">
                ${financials.costBasis.toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Purchase price</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                {financials.netProfit >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
                <span className="text-sm font-medium">Net Profit</span>
              </div>
              <div className={`text-2xl font-bold ${financials.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                ${financials.netProfit.toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-1">Revenue - Cost</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                {financials.roi >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
                <span className="text-sm font-medium">ROI</span>
              </div>
              <div className={`text-2xl font-bold ${financials.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                {financials.roi.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-1">Return on Investment</p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Breakdown */}
        <Collapsible defaultOpen>
          <Card>
            <CardHeader>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 -m-6 p-6 rounded-lg">
                <CardTitle className="card-title">Revenue Breakdown</CardTitle>
                <ChevronDown className="h-5 w-5 transition-transform duration-200" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Show Card Sales:</span>
                  <span className="font-semibold">${financials.showCardRevenue.toFixed(2)} ({financials.showCardSalesCount} cards)</span>
                </div>
                <div className="flex justify-between">
                  <span>Bulk Sales:</span>
                  <span className="font-semibold">${financials.bulkRevenue.toFixed(2)} ({financials.bulkSalesCount} sales)</span>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Show Cards */}
        <Collapsible defaultOpen>
          <Card>
            <CardHeader>
              <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 -m-6 p-6 rounded-lg">
                <CardTitle className="card-title">Show Cards ({showCards.length})</CardTitle>
                <ChevronDown className="h-5 w-5 transition-transform duration-200" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* Available Cards */}
                {cardsByStatus.available.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">AVAILABLE ({cardsByStatus.available.length} cards)</h4>
                    <div className="space-y-2">
                      {cardsByStatus.available.map((card) => (
                        <div key={card.id} className="flex items-center gap-3 p-2 border rounded">
                          {card.photo_front_url ? (
                            <img src={card.photo_front_url} className="w-20 h-20 object-cover rounded" alt={card.player_name} />
                          ) : (
                            <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{card.player_name}</div>
                            <div className="text-sm text-muted-foreground">{card.year}</div>
                            {card.asking_price && (
                              <div className="text-sm">Asking: ${Number(card.asking_price).toFixed(2)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sold Cards */}
                {cardsByStatus.sold.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">SOLD ({cardsByStatus.sold.length} cards)</h4>
                    <div className="space-y-2">
                      {cardsByStatus.sold.map((card) => (
                        <div key={card.id} className="flex items-center gap-3 p-2 border rounded">
                          {card.photo_front_url ? (
                            <img src={card.photo_front_url} className="w-20 h-20 object-cover rounded" alt={card.player_name} />
                          ) : (
                            <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{card.player_name}</div>
                            <div className="text-sm text-muted-foreground">{card.year}</div>
                            <div className="text-sm">
                              {card.asking_price && `Asking: $${Number(card.asking_price).toFixed(2)} | `}
                              {salePriceMap.get(card.id) && `Sold: $${salePriceMap.get(card.id)?.toFixed(2)}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Combined/Lost Cards */}
                {cardsByStatus.other.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">COMBINED/LOST ({cardsByStatus.other.length} cards)</h4>
                    <div className="space-y-2">
                      {cardsByStatus.other.map((card) => (
                        <div key={card.id} className="flex items-center gap-3 p-2 border rounded">
                          {card.photo_front_url ? (
                            <img src={card.photo_front_url} className="w-20 h-20 object-cover rounded" alt={card.player_name} />
                          ) : (
                            <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{card.player_name}</div>
                            <div className="text-sm text-muted-foreground">{card.year}</div>
                            <div className="text-sm capitalize">
                              {card.status === "combined" && card.destination_lot_id
                                ? `Combined to Lot ${card.destination_lot_id}`
                                : card.status}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Bulk Sales History */}
        {transactions.filter(t => t.transaction_type === "bulk_sale").length > 0 && (
          <Collapsible>
            <Card>
              <CardHeader>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 -m-6 p-6 rounded-lg">
                  <CardTitle className="card-title">Bulk Sales History</CardTitle>
                  <ChevronDown className="h-5 w-5 transition-transform duration-200" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Date</th>
                          <th className="text-left py-2">Qty</th>
                          <th className="text-left py-2">Amount</th>
                          <th className="text-left py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions
                          .filter(t => t.transaction_type === "bulk_sale")
                          .map((transaction) => (
                            <tr key={transaction.id} className="border-b">
                              <td className="py-2">{format(new Date(transaction.created_at), "MM/dd/yy")}</td>
                              <td className="py-2">{transaction.quantity || 0} cards</td>
                              <td className="py-2">${Number(transaction.revenue).toFixed(2)}</td>
                              <td className="py-2 truncate max-w-xs">{transaction.notes || "-"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Dispositions */}
        {dispositions.length > 0 && (
          <Collapsible>
            <Card>
              <CardHeader>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 -m-6 p-6 rounded-lg">
                  <CardTitle className="card-title">Dispositions</CardTitle>
                  <ChevronDown className="h-5 w-5 transition-transform duration-200" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Date</th>
                          <th className="text-left py-2">Type</th>
                          <th className="text-left py-2">Qty</th>
                          <th className="text-left py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dispositions.map((disposition) => (
                          <tr key={disposition.id} className="border-b">
                            <td className="py-2">{format(new Date(disposition.created_at), "MM/dd/yy")}</td>
                            <td className="py-2 capitalize">{disposition.transaction_type}</td>
                            <td className="py-2">{disposition.quantity || 0} cards</td>
                            <td className="py-2 truncate max-w-xs">{disposition.notes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Notes */}
        {lot.notes && (
          <Collapsible>
            <Card>
              <CardHeader>
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-accent/50 -m-6 p-6 rounded-lg">
                  <CardTitle className="card-title">Notes</CardTitle>
                  <ChevronDown className="h-5 w-5 transition-transform duration-200" />
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <p className="whitespace-pre-wrap">{lot.notes}</p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>

      {/* Close Lot Confirmation Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this lot?</AlertDialogTitle>
            <AlertDialogDescription>
              Have you accounted for all cards through sales, dispositions, or combinations?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseLot}>Confirm Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthenticatedLayout>
  );
};

export default LotDetail;
