import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Package, CreditCard, Calendar, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<string>("alltime");
  const { getEffectiveUserId, isViewingAsMentor, viewingUserId } = useMentorAccess();

  // Calculate date range based on selection
  const getDateRange = (): { startDate: string | null; endDate: string } => {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    
    switch (dateRange) {
      case "7days":
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 7);
        return { startDate: last7Days.toISOString().split('T')[0], endDate };
      
      case "30days":
        const last30Days = new Date(today);
        last30Days.setDate(today.getDate() - 30);
        return { startDate: last30Days.toISOString().split('T')[0], endDate };
      
      case "thismonth":
        const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: firstDayThisMonth.toISOString().split('T')[0], endDate };
      
      case "lastmonth":
        const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        return { 
          startDate: firstDayLastMonth.toISOString().split('T')[0], 
          endDate: lastDayLastMonth.toISOString().split('T')[0] 
        };
      
      case "thisyear":
        const firstDayThisYear = new Date(today.getFullYear(), 0, 1);
        return { startDate: firstDayThisYear.toISOString().split('T')[0], endDate };
      
      case "alltime":
      default:
        return { startDate: null, endDate };
    }
  };

  const getDateRangeLabel = (): string => {
    switch (dateRange) {
      case "7days": return "Last 7 Days";
      case "30days": return "Last 30 Days";
      case "thismonth": return "This Month";
      case "lastmonth": return "Last Month";
      case "thisyear": return "This Year";
      case "alltime":
      default: return "All Time";
    }
  };

  const { startDate, endDate } = getDateRange();

  // Cash Balance Query
  const { data: cashBalance, isLoading: loadingCash } = useQuery({
    queryKey: ["cashBalance", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("amount")
        .eq("user_id", userId);
      
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    },
  });

  // Total Revenue Query
  const { data: totalRevenue, isLoading: loadingRevenue } = useQuery({
    queryKey: ["totalRevenue", dateRange, viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("transactions")
        .select("revenue")
        .eq("user_id", userId)
        .in("transaction_type", ["show_card_sale", "bulk_sale"])
        .or("deleted.is.null,deleted.eq.false");
      
      if (startDate) {
        query = query.gte("transaction_date", startDate).lte("transaction_date", endDate);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;
    },
  });

  // Premium Sales Query (show_card_sale)
  const { data: premiumSales, isLoading: loadingPremium } = useQuery({
    queryKey: ["premiumSales", dateRange, viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("transactions")
        .select("revenue")
        .eq("user_id", userId)
        .eq("transaction_type", "show_card_sale")
        .or("deleted.is.null,deleted.eq.false");
      
      if (startDate) {
        query = query.gte("transaction_date", startDate).lte("transaction_date", endDate);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;
    },
  });

  // Bulk Sales Query
  const { data: bulkSales, isLoading: loadingBulk } = useQuery({
    queryKey: ["bulkSales", dateRange, viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("transactions")
        .select("revenue")
        .eq("user_id", userId)
        .eq("transaction_type", "bulk_sale")
        .or("deleted.is.null,deleted.eq.false");
      
      if (startDate) {
        query = query.gte("transaction_date", startDate).lte("transaction_date", endDate);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;
    },
  });

  // Average Sale Value Query
  const { data: averageSaleData, isLoading: loadingAverage } = useQuery({
    queryKey: ["averageSale", dateRange, viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("transactions")
        .select("revenue")
        .eq("user_id", userId)
        .in("transaction_type", ["show_card_sale", "bulk_sale"])
        .or("deleted.is.null,deleted.eq.false");
      
      if (startDate) {
        query = query.gte("transaction_date", startDate).lte("transaction_date", endDate);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const totalRevenue = data?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;
      const transactionCount = data?.length || 0;
      const averageValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;
      
      return { averageValue, transactionCount };
    },
  });

  // Lot Costs Query (exclude 'ordered' status)
  const { data: lotCosts, isLoading: loadingLotCosts } = useQuery({
    queryKey: ["lotCosts", dateRange, viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("lots")
        .select("total_cost")
        .eq("user_id", userId)
        .neq("status", "ordered");
      
      if (startDate) {
        query = query.gte("purchase_date", startDate).lte("purchase_date", endDate);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, l) => sum + Number(l.total_cost), 0) || 0;
    },
  });

  // Total Expenses Query
  const { data: totalExpenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ["totalExpenses", dateRange, viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("expenses")
        .select("amount")
        .eq("user_id", userId);
      
      if (startDate) {
        query = query.gte("expense_date", startDate).lte("expense_date", endDate);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
    },
  });

  // Calculate derived metrics
  const totalCosts = (lotCosts || 0) + (totalExpenses || 0);
  const netProfit = (totalRevenue || 0) - totalCosts;
  const profitMargin = totalRevenue && totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const getProfitColor = () => {
    if (netProfit > 0) return "metric-positive";
    if (netProfit < 0) return "metric-negative";
    return "text-primary";
  };

  const getMarginColor = () => {
    if (profitMargin >= 15) return "metric-positive";
    if (profitMargin >= 5) return "text-yellow-500";
    return "metric-negative";
  };

  // Active Lots Query
  const { data: activeLots, isLoading: loadingLots } = useQuery({
    queryKey: ["activeLots", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { count, error } = await supabase
        .from("lots")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active");
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Available Show Cards Query
  const { data: availableCards, isLoading: loadingCards } = useQuery({
    queryKey: ["availableCards", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { count, error } = await supabase
        .from("show_cards")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "available");
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Upcoming Shows Query
  const { data: upcomingShowsCount, isLoading: loadingShowsCount } = useQuery({
    queryKey: ["upcomingShowsCount", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { count, error } = await supabase
        .from("shows")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["planned", "active"]);
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Total Inventory Value Query (Sum of asking prices for available cards)
  const { data: inventoryValue, isLoading: loadingInventory } = useQuery({
    queryKey: ["inventoryValue", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      
      const { data, error } = await supabase
        .from("show_cards")
        .select("asking_price")
        .eq("user_id", userId)
        .eq("status", "available");
      
      if (error) throw error;
      return data?.reduce((sum, card) => sum + (Number(card.asking_price) || 0), 0) || 0;
    },
  });

  // Calculate Total Business Value
  const totalBusinessValue = (cashBalance || 0) + (inventoryValue || 0);

  // Calculate Inventory Turnover
  const inventoryTurnover = (inventoryValue && inventoryValue > 0) 
    ? (totalRevenue || 0) / inventoryValue 
    : (totalRevenue || 0) > 0 ? Infinity : 0;

  // Recent Activity Query
  const { data: recentActivity, isLoading: loadingActivity } = useQuery({
    queryKey: ["recentActivity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          show_cards (player_name),
          lots (source),
          shows (name)
        `)
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
  });

  // Upcoming Shows Details Query
  const { data: upcomingShows, isLoading: loadingShows } = useQuery({
    queryKey: ["upcomingShows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .in("status", ["planned", "active"])
        .order("show_date", { ascending: true })
        .limit(3);
      
      if (error) throw error;
      return data;
    },
  });

  const getTransactionTypeBadge = (type: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string; className?: string }> = {
      show_card_sale: { variant: "default", label: "Card Sale" },
      bulk_sale: { variant: "secondary", label: "Bulk Sale", className: "text-gray-900" },
      disposition: { variant: "outline", label: "Disposition", className: "text-gray-900" },
    };
    
    const config = variants[type] || { variant: "outline" as const, label: type, className: "text-gray-900" };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
      planned: { variant: "secondary", className: "text-gray-900" },
      active: { variant: "default" },
      completed: { variant: "outline", className: "text-gray-900" },
    };
    
    const displayLabel = status === "completed" ? "Closed" : status.charAt(0).toUpperCase() + status.slice(1);
    const config = variants[status] || { variant: "outline" as const, className: "text-gray-900" };
    return <Badge variant={config.variant} className={config.className}>{displayLabel}</Badge>;
  };

  const isLoadingInitial = loadingRevenue || loadingLotCosts || loadingExpenses || loadingCash;

  return (
    <div className="container mx-auto px-4 py-6 space-y-8 max-w-7xl pb-24">
      {/* Header with Date Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="w-full md:w-auto">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-full md:w-[200px] bg-card border-input text-foreground">
              <Calendar className="mr-2 h-4 w-4 text-accent" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-input text-foreground">
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="thismonth">This Month</SelectItem>
              <SelectItem value="lastmonth">Last Month</SelectItem>
              <SelectItem value="thisyear">This Year</SelectItem>
              <SelectItem value="alltime">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Section 1: Am I Profitable? */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">
          Am I Profitable?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* NET PROFIT - Hero Card with Gold Effect */}
          <div className="night-game-card p-6 relative group cursor-pointer" onClick={() => navigate('/transaction-history')}>
            <div className="flex flex-col h-full justify-between relative z-10">
              <TrendingUp className="h-8 w-8 text-accent mb-4" />
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Net Profit
                </h3>
                {isLoadingInitial ? (
                  <Skeleton className="h-12 w-3/4 bg-muted/20" />
                ) : (
                  <>
                    <div className="text-4xl md:text-5xl font-bold gold-stat-text mb-2">
                      ${netProfit.toFixed(2)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getDateRangeLabel() === "All Time" 
                        ? "Money earned after all costs"
                        : `${getDateRangeLabel()} - Money earned after costs`
                      }
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="absolute right-0 bottom-0 opacity-5 transform translate-x-1/4 translate-y-1/4 z-0">
              <TrendingUp className="h-32 w-32 text-accent" />
            </div>
          </div>

          {/* PROFIT MARGIN */}
          <div className="night-game-card p-6 relative overflow-hidden">
            <div className="relative z-10">
              <TrendingUp className="h-8 w-8 text-accent mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Profit Margin
              </h3>
              {isLoadingInitial ? (
                <Skeleton className="h-10 w-1/2 bg-muted/20" />
              ) : (
                <>
                  <div className={`text-3xl font-bold ${getMarginColor()}`}>
                    {profitMargin.toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {getDateRangeLabel() === "All Time" 
                      ? "Percentage kept as profit"
                      : `${getDateRangeLabel()} - Percentage kept as profit`
                    }
                  </p>
                </>
              )}
            </div>
          </div>

          {/* TOTAL REVENUE */}
          <div className="night-game-card p-6 relative overflow-hidden">
            <div className="relative z-10">
              <TrendingUp className="h-8 w-8 text-accent mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Total Revenue
              </h3>
              {loadingRevenue ? (
                <Skeleton className="h-10 w-1/2 bg-muted/20" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-foreground">
                    ${(totalRevenue || 0).toFixed(2)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {getDateRangeLabel() === "All Time" 
                      ? "Total money from card sales"
                      : `${getDateRangeLabel()} - Total from card sales`
                    }
                  </p>
                </>
              )}
            </div>
          </div>

          {/* CASH ON HAND */}
          <div className="night-game-card p-6 relative overflow-hidden">
            <div className="relative z-10">
              <Wallet className="h-8 w-8 text-accent mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Cash on Hand
              </h3>
              {loadingCash ? (
                <Skeleton className="h-10 w-1/2 bg-muted/20" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-foreground">
                    ${(cashBalance || 0).toFixed(2)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Money available to spend
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: How Am I Selling? */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">
          How Am I Selling?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* TOTAL COSTS */}
          <div className="night-game-card p-6">
            <Package className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Total Costs
            </h3>
            {loadingLotCosts || loadingExpenses ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  ${totalCosts.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {getDateRangeLabel() === "All Time" 
                    ? "Cost of inventory + expenses"
                    : `${getDateRangeLabel()} - Inventory + expenses`
                  }
                </p>
              </>
            )}
          </div>

          {/* PREMIUM SALES */}
          <div className="night-game-card p-6">
            <CreditCard className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Premium Sales
            </h3>
            {loadingPremium ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  ${(premiumSales || 0).toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {getDateRangeLabel() === "All Time" 
                    ? "Revenue from individual card sales"
                    : `${getDateRangeLabel()} - Individual card sales`
                  }
                </p>
              </>
            )}
          </div>

          {/* BULK SALES */}
          <div className="night-game-card p-6">
            <Package className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Bulk Sales
            </h3>
            {loadingBulk ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  ${(bulkSales || 0).toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {getDateRangeLabel() === "All Time" 
                    ? "Revenue from multi-card sales"
                    : `${getDateRangeLabel()} - Multi-card sales`
                  }
                </p>
              </>
            )}
          </div>

          {/* SHOW CARD INVENTORY */}
          <div className="night-game-card p-6">
            <CreditCard className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Show Card Inventory
            </h3>
            {loadingCards ? (
              <Skeleton className="h-10 w-16 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  {availableCards}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  High-value cards ready to sell
                </p>
              </>
            )}
          </div>

          {/* AVERAGE SALE VALUE */}
          <div className="night-game-card p-6">
            <TrendingUp className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Average Sale Value
            </h3>
            {loadingAverage ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  ${(averageSaleData?.averageValue || 0).toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {getDateRangeLabel() === "All Time" 
                    ? "Average money per transaction"
                    : `${getDateRangeLabel()} - Avg per transaction`
                  }
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: What's My Investment? */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">
          What's My Investment?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* TOTAL INVENTORY VALUE */}
          <div className="night-game-card p-6">
            <Package className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Total Inventory Value
            </h3>
            {loadingInventory ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  ${(inventoryValue || 0).toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Money tied up in unsold cards
                </p>
              </>
            )}
          </div>

          {/* TOTAL BUSINESS VALUE */}
          <div className="night-game-card p-6">
            <Wallet className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Total Business Value
            </h3>
            {loadingCash || loadingInventory ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  ${totalBusinessValue.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Total worth if liquidated today
                </p>
              </>
            )}
          </div>

          {/* INVENTORY TURNOVER */}
          <div className="night-game-card p-6">
            <TrendingUp className="h-8 w-8 text-accent mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Inventory Turnover
            </h3>
            {loadingRevenue || loadingInventory ? (
              <Skeleton className="h-10 w-1/2 bg-muted/20" />
            ) : (
              <>
                <div className="text-3xl font-bold text-foreground">
                  {inventoryTurnover === Infinity ? "∞" : inventoryTurnover.toFixed(1)}x
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {getDateRangeLabel() === "All Time" 
                    ? "Inventory converts to cash"
                    : `${getDateRangeLabel()} - Inventory to cash speed`
                  }
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col md:flex-row gap-4">
        <Button 
          onClick={() => navigate("/transactions/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-lg font-semibold uppercase flex-1"
        >
          RECORD SALE
        </Button>
        <Button 
          onClick={() => navigate("/show-cards/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-lg font-semibold uppercase flex-1"
        >
          ADD SHOW CARD
        </Button>
        <Button 
          onClick={() => navigate("/shows/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-lg font-semibold uppercase flex-1"
        >
          CREATE SHOW
        </Button>
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">
          Recent Activity
        </h2>
        <div className="night-game-card p-6 overflow-x-auto">
          {loadingActivity ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-muted/20" />
              ))}
            </div>
          ) : !recentActivity || recentActivity.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No transactions yet. Record your first sale!
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-sm font-semibold uppercase text-muted-foreground">Date</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold uppercase text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold uppercase text-muted-foreground">Description</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold uppercase text-muted-foreground">Amount</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold uppercase text-muted-foreground">Show</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((transaction: any) => (
                  <tr key={transaction.id} className="border-b border-border/50">
                    <td className="py-3 px-2 text-sm text-foreground">
                      {format(new Date(transaction.created_at), "MM/dd/yy")}
                    </td>
                    <td className="py-3 px-2">
                      {getTransactionTypeBadge(transaction.transaction_type)}
                    </td>
                    <td className="py-3 px-2 text-sm text-foreground">
                      {transaction.show_cards?.player_name || transaction.lots?.source || "—"}
                    </td>
                    <td className="py-3 px-2 text-sm text-right metric-positive">
                      ${Number(transaction.revenue).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-sm text-foreground">
                      {transaction.shows?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Upcoming Shows */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">
          Upcoming Shows
        </h2>
        {loadingShows ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full bg-muted/20" />
            ))}
          </div>
        ) : !upcomingShows || upcomingShows.length === 0 ? (
          <div className="night-game-card p-6 text-center">
            <p className="mb-4 text-muted-foreground">No upcoming shows. Create your first show!</p>
            <Button onClick={() => navigate("/shows/new")}>Create Show</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingShows.map((show: any) => (
                <div key={show.id} className="night-game-card p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">{show.name}</h3>
                    {getStatusBadge(show.status)}
                  </div>
                  <p className="text-sm mb-1 text-foreground">
                    {format(new Date(show.show_date), "MMM dd, yyyy")}
                  </p>
                  <p className="text-sm mb-3 text-muted-foreground">
                    {show.location || "Location TBD"}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Table Cost: ${Number(show.table_cost).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <Button variant="outline" onClick={() => navigate("/shows")}>
                View All Shows
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
