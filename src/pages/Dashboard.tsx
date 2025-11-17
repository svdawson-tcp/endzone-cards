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
    if (netProfit > 0) return { color: 'var(--metric-positive)' };
    if (netProfit < 0) return { color: 'var(--metric-negative)' };
    return { color: 'var(--text-primary)' };
  };

  const getMarginColor = () => {
    if (profitMargin >= 15) return { color: 'var(--metric-positive)' };
    if (profitMargin >= 5) return { color: '#F59E0B' };
    return { color: 'var(--metric-negative)' };
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

  // Total Inventory Value Query (Cost Basis)
  const { data: inventoryValue, isLoading: loadingInventory } = useQuery({
    queryKey: ["inventoryValue", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      
      // Get total cost of all lots
      const { data: lotsData, error: lotsError } = await supabase
        .from("lots")
        .select("id, total_cost")
        .eq("user_id", userId);
      
      if (lotsError) throw lotsError;
      
      const totalLotCost = lotsData?.reduce((sum, lot) => sum + Number(lot.total_cost), 0) || 0;
      
      // Get total revenue from sold cards
      const { data: revenueData, error: revenueError } = await supabase
        .from("transactions")
        .select("revenue")
        .eq("user_id", userId)
        .in("transaction_type", ["show_card_sale", "bulk_sale"])
        .or("deleted.is.null,deleted.eq.false");
      
      if (revenueError) throw revenueError;
      
      const totalRevenue = revenueData?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;
      
      // Inventory value = lot costs - sold revenue
      return Math.max(0, totalLotCost - totalRevenue);
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Date Range Selector */}
        <div className="flex justify-center mb-8">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[200px] bg-card">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="thismonth">This Month</SelectItem>
              <SelectItem value="lastmonth">Last Month</SelectItem>
              <SelectItem value="thisyear">This Year</SelectItem>
              <SelectItem value="alltime">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Section 1: Am I profitable? */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            AM I PROFITABLE?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Net Profit */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              NET PROFIT
            </p>
            {loadingRevenue || loadingLotCosts || loadingExpenses ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={getProfitColor()}>
                  ${netProfit.toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Money earned after all costs"
                    : `${getDateRangeLabel()} - Money earned after all costs`
                  }
                </p>
              </>
            )}
          </div>

          {/* Profit Margin */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              PROFIT MARGIN
            </p>
            {loadingRevenue || loadingLotCosts || loadingExpenses ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={getMarginColor()}>
                  {profitMargin.toFixed(1)}%
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Percentage of revenue kept as profit"
                    : `${getDateRangeLabel()} - Percentage kept as profit`
                  }
                </p>
              </>
            )}
          </div>

          {/* Total Revenue */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              TOTAL REVENUE
            </p>
            {loadingRevenue ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${(totalRevenue || 0).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Total money from card sales"
                    : `${getDateRangeLabel()} - Total from card sales`
                  }
                </p>
              </>
            )}
          </div>

          {/* Cash on Hand */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              CASH ON HAND
            </p>
            {loadingCash ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${(cashBalance || 0).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Money available to spend</p>
              </>
            )}
          </div>

          </div>
        </section>

        {/* Section 2: How am I selling? */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            HOW AM I SELLING?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Premium Sales */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <Package className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              TOTAL COSTS
            </p>
            {loadingLotCosts || loadingExpenses ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${totalCosts.toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Cost of inventory + business expenses"
                    : `${getDateRangeLabel()} - Inventory + expenses`
                  }
                </p>
              </>
            )}
          </div>

          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <CreditCard className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              PREMIUM SALES
            </p>
            {loadingPremium ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${(premiumSales || 0).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Revenue from individual card sales"
                    : `${getDateRangeLabel()} - Individual card sales`
                  }
                </p>
              </>
            )}
          </div>

          {/* Bulk Sales */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <Package className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              BULK SALES
            </p>
            {loadingBulk ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${(bulkSales || 0).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Revenue from multi-card sales"
                    : `${getDateRangeLabel()} - Multi-card sales`
                  }
                </p>
              </>
            )}
          </div>

          {/* Show Card Inventory */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <CreditCard className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              SHOW CARD INVENTORY
            </p>
            {loadingCards ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{availableCards}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>High-value cards ready to sell</p>
              </>
            )}
          </div>

          {/* Average Sale Value */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              AVERAGE SALE VALUE
            </p>
            {loadingAverage ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${(averageSaleData?.averageValue || 0).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Average money earned per transaction"
                    : `${getDateRangeLabel()} - Avg per transaction`
                  }
                </p>
              </>
            )}
          </div>
          </div>
        </section>

        {/* Section 3: What's my investment? */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            WHAT'S MY INVESTMENT?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Costs */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <Package className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              TOTAL COSTS
            </p>
            {loadingLotCosts || loadingExpenses ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${totalCosts.toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "Cost of inventory + business expenses"
                    : `${getDateRangeLabel()} - Inventory + expenses`
                  }
                </p>
              </>
            )}
          </div>

          {/* Total Inventory Value */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <Package className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              TOTAL INVENTORY VALUE
            </p>
            {loadingInventory ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${(inventoryValue || 0).toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Money tied up in unsold cards</p>
              </>
            )}
          </div>

          {/* Total Business Value */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <Wallet className="h-8 w-8 text-purple-600" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              TOTAL BUSINESS VALUE
            </p>
            {loadingCash || loadingInventory ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${totalBusinessValue.toFixed(2)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Total worth if liquidated today</p>
              </>
            )}
          </div>

          {/* Inventory Turnover */}
          <div 
            className="rounded-lg p-6" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              INVENTORY TURNOVER
            </p>
            {loadingRevenue || loadingInventory ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {inventoryTurnover === Infinity ? "∞" : inventoryTurnover.toFixed(1)}x
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {getDateRangeLabel() === "All Time" 
                    ? "How quickly inventory converts to cash"
                    : `${getDateRangeLabel()} - Inventory to cash speed`
                  }
                </p>
              </>
            )}
          </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="flex flex-col md:flex-row gap-4 mb-12">
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
        </section>

        {/* Recent Activity */}
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>RECENT ACTIVITY</h2>
          <div 
            className="rounded-lg p-6 overflow-x-auto" 
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--border-default)', 
              boxShadow: 'var(--shadow-base)' 
            }}
          >
            {loadingActivity ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !recentActivity || recentActivity.length === 0 ? (
              <p className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                No transactions yet. Record your first sale!
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Date</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Type</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Description</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Amount</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Show</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((transaction: any) => (
                    <tr key={transaction.id} className="border-b border-border/50">
                      <td className="py-3 px-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {format(new Date(transaction.created_at), "MM/dd/yy")}
                      </td>
                      <td className="py-3 px-2">
                        {getTransactionTypeBadge(transaction.transaction_type)}
                      </td>
                      <td className="py-3 px-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {transaction.show_cards?.player_name || transaction.lots?.source || "—"}
                      </td>
                      <td className="py-3 px-2 text-sm text-right" style={{ color: 'var(--metric-positive)' }}>
                        ${Number(transaction.revenue).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {transaction.shows?.name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Upcoming Shows */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>UPCOMING SHOWS</h2>
          {loadingShows ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : !upcomingShows || upcomingShows.length === 0 ? (
            <div 
              className="rounded-lg p-6 text-center" 
              style={{ 
                backgroundColor: 'var(--card-bg)', 
                border: '1px solid var(--border-default)', 
                boxShadow: 'var(--shadow-base)' 
              }}
            >
              <p className="mb-4" style={{ color: 'var(--text-tertiary)' }}>No upcoming shows. Create your first show!</p>
              <Button onClick={() => navigate("/shows/new")}>Create Show</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {upcomingShows.map((show: any) => (
                  <div 
                    key={show.id} 
                    className="rounded-lg p-6" 
                    style={{ 
                      backgroundColor: 'var(--card-bg)', 
                      border: '1px solid var(--border-default)', 
                      boxShadow: 'var(--shadow-base)' 
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{show.name}</h3>
                      {getStatusBadge(show.status)}
                    </div>
                    <p className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                      {format(new Date(show.show_date), "MMM dd, yyyy")}
                    </p>
                    <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>
                      {show.location || "Location TBD"}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Table Cost: ${Number(show.table_cost).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="text-center">
                <Button variant="outline" onClick={() => navigate("/shows")}>
                  View All Shows
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
