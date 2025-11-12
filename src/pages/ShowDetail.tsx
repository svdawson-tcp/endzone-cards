import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Calendar, 
  MapPin, 
  DollarSign, 
  ArrowLeft, 
  Edit,
  TrendingUp,
  TrendingDown,
  Receipt,
  ShoppingCart,
  Package,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type ShowStatus = "planned" | "active" | "completed";

interface Show {
  id: string;
  name: string;
  show_date: string;
  location: string | null;
  table_cost: number;
  booth_number: string | null;
  status: ShowStatus;
  notes: string | null;
}

interface Transaction {
  id: string;
  transaction_type: string;
  revenue: number;
  quantity: number | null;
  notes: string | null;
  created_at: string;
  show_card_id: string | null;
  lot_id: string | null;
}

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  notes: string | null;
}

export default function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch show details
  const { data: show, isLoading: showLoading } = useQuery({
    queryKey: ["show", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      return data as Show;
    },
    enabled: !!id,
  });

  // Fetch transactions for this show
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ["show-transactions", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("show_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!id,
  });

  // Fetch expenses for this show
  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["show-expenses", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("show_id", id)
        .eq("user_id", user.id)
        .order("expense_date", { ascending: false });

      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!id,
  });

  // Status change mutation
  const statusChangeMutation = useMutation({
    mutationFn: async ({ showId, newStatus }: { showId: string; newStatus: ShowStatus }) => {
      if (newStatus === "planned") {
        const { count: txCount, error: txError } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("show_id", showId);

        if (txError) throw txError;

        const { count: expCount, error: expError } = await supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("show_id", showId);

        if (expError) throw expError;

        if ((txCount || 0) > 0 || (expCount || 0) > 0) {
          throw new Error(
            `Cannot revert to Planned - this show has ${txCount || 0} transaction(s) and ${expCount || 0} expense(s) recorded. Shows with financial records cannot be reverted.`
          );
        }
      }

      const { error } = await supabase
        .from("shows")
        .update({ status: newStatus })
        .eq("id", showId);

      if (error) throw error;
      return { showId, newStatus };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["show", id] });
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

  // Calculate metrics
  const showCardSales = transactions.filter(t => t.transaction_type === "show_card_sale");
  const bulkSales = transactions.filter(t => t.transaction_type === "bulk_sale");
  
  const showCardRevenue = showCardSales.reduce((sum, t) => sum + Number(t.revenue), 0);
  const bulkRevenue = bulkSales.reduce((sum, t) => sum + Number(t.revenue), 0);
  const totalRevenue = showCardRevenue + bulkRevenue;

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = totalRevenue - totalExpenses - Number(show?.table_cost || 0);
  const roi = show?.table_cost ? ((netProfit / Number(show.table_cost)) * 100) : 0;

  const getStatusBadgeVariant = (status: ShowStatus) => {
    switch (status) {
      case "planned": return "secondary";
      case "active": return "default";
      case "completed": return "outline";
      default: return "secondary";
    }
  };

  if (showLoading || transactionsLoading || expensesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-gray-600">Loading show details...</p>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Show not found</h2>
          <Button onClick={() => navigate("/shows")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Shows
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/shows")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Shows
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {/* Page Title - Uses page-title class for white text on dark background */}
                <h1 className="page-title mb-2">{show.name}</h1>
                <Badge variant={getStatusBadgeVariant(show.status)} className="text-gray-900">
                  {show.status}
                </Badge>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{format(new Date(show.show_date), "MMMM dd, yyyy")}</span>
                </div>
                {show.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{show.location}</span>
                  </div>
                )}
                {show.booth_number && (
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    <span>Booth {show.booth_number}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/shows/${id}/edit`)}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit Show
              </Button>
            </div>
          </div>
        </div>

        {/* Status Action Buttons */}
        {show.status === "planned" && (
          <div className="mb-6">
            <Button
              onClick={() => statusChangeMutation.mutate({ showId: show.id, newStatus: "active" })}
              disabled={statusChangeMutation.isPending}
              className="w-full md:w-auto bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold"
            >
              START SHOW
            </Button>
          </div>
        )}

        {show.status === "active" && (
          <div className="mb-6">
            <Button
              onClick={() => statusChangeMutation.mutate({ showId: show.id, newStatus: "completed" })}
              disabled={statusChangeMutation.isPending}
              className="w-full md:w-auto bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white font-semibold"
            >
              CLOSE SHOW
            </Button>
          </div>
        )}

        {/* Profitability Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-600">
                  ${totalRevenue.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {showCardSales.length} premium + {bulkSales.length} bulk
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-red-600" />
                <span className="text-2xl font-bold text-red-600">
                  ${(totalExpenses + Number(show.table_cost)).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                ${show.table_cost.toFixed(2)} table + ${totalExpenses.toFixed(2)} other
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Net Profit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className={`h-5 w-5 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                <span className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${netProfit.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Revenue - All Costs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">ROI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className={`h-5 w-5 ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                <span className={`text-2xl font-bold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {roi.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Return on Investment
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Breakdown - Collapsible */}
        <Collapsible defaultOpen className="mb-6">
          <Card>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-6 hover:bg-accent/50 transition-colors">
              <CardTitle className="text-gray-900">Revenue Breakdown</CardTitle>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-[hsl(var(--navy-base))]" />
                      <span className="text-gray-900">Show Card Sales</span>
                    </div>
                    <span className="font-semibold text-green-600">
                      ${showCardRevenue.toFixed(2)} ({showCardSales.length} cards)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-[hsl(var(--navy-base))]" />
                      <span className="text-gray-900">Bulk Sales</span>
                    </div>
                    <span className="font-semibold text-green-600">
                      ${bulkRevenue.toFixed(2)} ({bulkSales.reduce((sum, t) => sum + (t.quantity || 0), 0)} cards)
                    </span>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Transaction History - Collapsible */}
        <Collapsible className="mb-6">
          <Card>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-6 hover:bg-accent/50 transition-colors">
              <CardTitle className="text-gray-900">Transactions ({transactions.length})</CardTitle>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {transactions.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No transactions recorded</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 text-sm font-semibold text-gray-900">Date</th>
                          <th className="text-left py-2 px-2 text-sm font-semibold text-gray-900">Type</th>
                          <th className="text-left py-2 px-2 text-sm font-semibold text-gray-900">Amount</th>
                          <th className="text-left py-2 px-2 text-sm font-semibold text-gray-900">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="border-b last:border-0">
                            <td className="py-3 px-2 text-sm text-gray-900">
                              {format(new Date(tx.created_at), "MM/dd/yy")}
                            </td>
                            <td className="py-3 px-2">
                              <Badge variant="outline" className="text-gray-900 border-gray-400 bg-gray-100">
                                {tx.transaction_type === "show_card_sale" ? "Premium" : "Bulk"}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-sm font-semibold text-green-600">
                              ${Number(tx.revenue).toFixed(2)}
                            </td>
                            <td className="py-3 px-2 text-sm text-gray-600 truncate max-w-xs">
                              {tx.notes || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Expenses - Collapsible */}
        <Collapsible defaultOpen className="mb-6">
          <Card>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-6 hover:bg-accent/50 transition-colors">
              <CardTitle className="text-gray-900">Expenses ({expenses.length + 1})</CardTitle>
              <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {expenses.length === 0 && show.table_cost === 0 ? (
                  <p className="text-gray-500 text-center py-8">No expenses recorded</p>
                ) : (
                  <div className="space-y-3">
                    {/* Booth Fee */}
                    <div className="flex justify-between items-center pb-3 border-b">
                      <span className="text-gray-900">Booth Fee: ${Number(show.table_cost).toFixed(2)}</span>
                    </div>
                    
                    {/* Other expenses by category */}
                    {expenses.reduce((acc: { [key: string]: number }, exp) => {
                      acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
                      return acc;
                    }, {} as { [key: string]: number })
                    && Object.entries(
                      expenses.reduce((acc: { [key: string]: number }, exp) => {
                        acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
                        return acc;
                      }, {})
                    ).map(([category, amount]) => (
                      <div key={category} className="flex justify-between items-center">
                        <span className="text-gray-900">{category}: ${amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Notes Section - Only if notes exist */}
        {show.notes && (
          <Collapsible>
            <Card>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-6 hover:bg-accent/50 transition-colors">
                <CardTitle className="text-gray-900">Notes</CardTitle>
                <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 [data-state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <p className="text-gray-700 whitespace-pre-wrap">{show.notes}</p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
