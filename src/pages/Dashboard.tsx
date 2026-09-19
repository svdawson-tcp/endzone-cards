import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Package, CreditCard, Calendar, Wallet, Receipt, PiggyBank, ShoppingCart, HandCoins, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { format, differenceInCalendarDays } from "date-fns";
import { formatBusinessDate, previousPeriodRange, sameRangeLastYear } from "@/lib/dateUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { KpiInfoPopover } from "@/components/ui/KpiInfoPopover";
import { kpiTooltips } from "@/data/kpiTooltips";
import { usePeriod, formatRangeLabel } from "@/hooks/usePeriod";
import { PeriodPicker } from "@/components/PeriodPicker";
import { TrendChart, type PeriodSeriesRow } from "@/components/TrendChart";
import { ChangeLine } from "@/components/ChangeLine";

const COMPARE_STORAGE_KEY = "dashboardCompare";

type DashboardAccount = {
  id: string;
  name: string;
  kind: string;
  target: number | null;
  is_default: boolean;
  balance: number;
};

type DashboardMetrics = {
  revenue: number;
  premium_revenue: number;
  bulk_revenue: number;
  sale_count: number;
  avg_sale: number;
  inventory_purchased: number;
  lots_purchased: number;
  expenses: number;
  expense_count: number;
  cash_in_minus_out: number;
  tax_setaside: number;
  owner_contributions: number;
  owner_draws: number;
  reimbursements: number;
  cash_on_hand: number;
  owed_to_owner: number;
  accounts: DashboardAccount[];
  active_lots: number;
  listed_cards: number;
  listed_cards_value: number;
};

const readStoredCompare = (): string => {
  try {
    const stored = localStorage.getItem(COMPARE_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // ignore storage errors
  }
  return "previous";
};

const money = (value: unknown) => `$${Number(value || 0).toFixed(2)}`;

export default function Dashboard() {
  const navigate = useNavigate();
  const periodState = usePeriod();
  const { period, start, end, customInvalid, rangeLabel } = periodState;
  const [compare, setCompare] = useState<string>(readStoredCompare);
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();

  const handleCompareChange = (value: string) => {
    setCompare(value);
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, value);
    } catch {
      // ignore storage errors
    }
  };

  const compareAvailable = period !== "alltime" && !!start && !!end;
  const compareRange =
    !compareAvailable || compare === "off"
      ? null
      : compare === "lastyear"
        ? sameRangeLastYear(start, end)
        : previousPeriodRange(period, start, end);

  const comparisonLabel = compareRange ? formatRangeLabel(compareRange.start, compareRange.end) : "";
  const comparisonShortLabel = compareRange
    ? `${formatBusinessDate(compareRange.start, "MMM d")} – ${formatBusinessDate(compareRange.end, "MMM d")}`
    : "";

  // Trend grain: weekly for ranges up to 26 weeks, otherwise monthly
  const grain: "week" | "month" =
    !start || !end
      ? "month"
      : differenceInCalendarDays(new Date(end), new Date(start)) <= 26 * 7
        ? "week"
        : "month";

  // ISS-005: single RPC — all money math happens in the database
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["dashboardMetrics", viewingUserId, start, end],
    enabled: !customInvalid,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_dashboard_metrics", {
        p_user_id: userId,
        p_start: start,
        p_end: end,
      });
      if (error) throw error;
      return data as unknown as DashboardMetrics;
    },
  });

  // Comparison period — separate query, all totals still from the database
  const { data: compareMetrics } = useQuery({
    queryKey: ["dashboardMetricsCompare", viewingUserId, compareRange?.start, compareRange?.end],
    enabled: !customInvalid && !!compareRange,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_dashboard_metrics", {
        p_user_id: userId,
        p_start: compareRange!.start,
        p_end: compareRange!.end,
      });
      if (error) throw error;
      return data as unknown as DashboardMetrics;
    },
  });

  // Trend series
  const { data: series } = useQuery({
    queryKey: ["periodSeries", viewingUserId, start, end, grain],
    enabled: !customInvalid,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_period_series", {
        p_user_id: userId,
        p_start: start,
        p_end: end,
        p_grain: grain,
      });
      if (error) throw error;
      return (data || []) as unknown as PeriodSeriesRow[];
    },
  });

  // Upcoming Shows Query (unchanged)
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

  // Recent Activity Query
  const { data: recentActivity, isLoading: loadingActivity } = useQuery({
    queryKey: ["recentActivity", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          show_cards (player_name),
          lots (source),
          shows (name)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  // Upcoming Shows Details Query
  const { data: upcomingShows, isLoading: loadingShows } = useQuery({
    queryKey: ["upcomingShows", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("user_id", userId)
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

  const cashFlow = Number(metrics?.cash_in_minus_out || 0);
  const cashFlowColor = cashFlow > 0 ? "metric-positive" : cashFlow < 0 ? "metric-negative" : "text-foreground";

  const accounts = metrics?.accounts || [];
  const reserveAccount = accounts.find((a) => a.kind === "reserve");
  const reserveBalance = Number(reserveAccount?.balance || 0);
  const reserveTarget = Number(reserveAccount?.target || 0);
  const reserveProgress = reserveTarget > 0 ? Math.min(100, (reserveBalance / reserveTarget) * 100) : 0;
  const owedToOwner = Number(metrics?.owed_to_owner || 0);

  const Tile = ({
    icon: Icon,
    title,
    value,
    subtext,
    tooltip,
    valueClassName,
    footer,
  }: {
    icon: typeof TrendingUp;
    title: string;
    value: string;
    subtext?: string;
    tooltip: string;
    valueClassName?: string;
    footer?: React.ReactNode;
  }) => (
    <div className="night-game-card p-4 md:p-6 relative">
      <KpiInfoPopover content={tooltip} />
      <Icon className="h-7 w-7 md:h-8 md:w-8 text-accent mb-3 md:mb-4" />
      <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1 pr-8">
        {title}
      </h3>
      {loadingMetrics ? (
        <Skeleton className="h-9 w-2/3 bg-muted/20" />
      ) : (
        <>
          <div className={`text-2xl md:text-3xl font-bold ${valueClassName || "text-foreground"}`}>
            {value}
          </div>
          {subtext && <p className="text-xs md:text-sm text-muted-foreground mt-2">{subtext}</p>}
          {footer}
        </>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-6 space-y-8 max-w-7xl pb-24">
      {/* Header with Period Picker */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground uppercase tracking-wide">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{rangeLabel}</p>
          {compareRange && (
            <p className="text-xs text-muted-foreground mt-1">Compared with {comparisonLabel}</p>
          )}
        </div>
        <PeriodPicker state={periodState}>
          {compareAvailable && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="compare-to">Compare to</label>
              <Select value={compare} onValueChange={handleCompareChange}>
                <SelectTrigger id="compare-to" className="w-full md:w-[220px] min-h-[44px] bg-card border-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-input text-foreground">
                  <SelectItem value="previous">Previous period</SelectItem>
                  <SelectItem value="lastyear">Same period last year</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </PeriodPicker>
      </div>

      {/* Section A: This Period */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">This Period</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Tile icon={TrendingUp} title="Revenue" tooltip={kpiTooltips.revenue}
            value={money(metrics?.revenue)}
            subtext={
              compareRange && compareMetrics
                ? `${Number(metrics?.sale_count || 0)} sales (was ${Number(compareMetrics.sale_count || 0)})`
                : `${Number(metrics?.sale_count || 0)} sales`
            }
            footer={
              compareRange && compareMetrics ? (
                <ChangeLine current={metrics?.revenue} previous={compareMetrics.revenue}
                  comparisonLabel={comparisonShortLabel} colored />
              ) : undefined
            } />
          <Tile icon={ShoppingCart} title="Buying" tooltip={kpiTooltips.buying}
            value={money(metrics?.inventory_purchased)} subtext={`${Number(metrics?.lots_purchased || 0)} lots`}
            footer={
              compareRange && compareMetrics ? (
                <ChangeLine current={metrics?.inventory_purchased} previous={compareMetrics.inventory_purchased}
                  comparisonLabel={comparisonShortLabel} />
              ) : undefined
            } />
          <Tile icon={Wallet} title="Cash In − Cash Out" tooltip={kpiTooltips.cashInMinusOut}
            value={money(metrics?.cash_in_minus_out)} valueClassName={cashFlowColor} />
          <Tile icon={Receipt} title="Expenses Logged" tooltip={kpiTooltips.expensesLogged}
            value={money(metrics?.expenses)} subtext={`${Number(metrics?.expense_count || 0)} entries`}
            footer={
              compareRange && compareMetrics ? (
                <ChangeLine current={metrics?.expenses} previous={compareMetrics.expenses}
                  comparisonLabel={comparisonShortLabel} />
              ) : undefined
            } />
          <Tile icon={PiggyBank} title="Tax Set-Aside" tooltip={kpiTooltips.taxSetAside}
            value={money(metrics?.tax_setaside)} subtext="4% of sales — move to Tax account" />
          <Tile icon={TrendingUp} title="Average Sale" tooltip={kpiTooltips.averageSale}
            value={money(metrics?.avg_sale)}
            footer={
              compareRange && compareMetrics ? (
                <ChangeLine current={metrics?.avg_sale} previous={compareMetrics.avg_sale}
                  comparisonLabel={comparisonShortLabel} colored />
              ) : undefined
            } />
          <Tile icon={CreditCard} title="Show Card Sales" tooltip={kpiTooltips.premiumSales}
            value={money(metrics?.premium_revenue)} />
          <Tile icon={Package} title="Bulk Sales" tooltip={kpiTooltips.bulkSales}
            value={money(metrics?.bulk_revenue)} />
          <Tile icon={HandCoins} title="Owner Draws" tooltip={kpiTooltips.ownerDraws}
            value={money(metrics?.owner_draws)} subtext="Money you took out of the business" />
        </div>
      </div>

      {/* Trend */}
      {series && series.length > 0 && <TrendChart series={series} grain={grain} />}

      {/* Section B: Right Now */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">Right Now</h2>
          <p className="text-xs text-muted-foreground mt-1">Not affected by the date range</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Tile icon={Wallet} title="Cash on Hand" tooltip={kpiTooltips.cashOnHand}
            value={money(metrics?.cash_on_hand)}
            footer={
              accounts.length > 0 ? (
                <div className="mt-3 space-y-1">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{account.name}</span>
                      <span>{money(account.balance)}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => navigate("/accounts")}
                    className="text-xs text-accent underline min-h-[44px] pt-2"
                  >
                    View accounts
                  </button>
                </div>
              ) : undefined
            } />
          <Tile icon={Landmark} title="Reserve" tooltip={kpiTooltips.reserve}
            value={money(reserveBalance)}
            subtext={reserveTarget > 0 ? `${reserveProgress.toFixed(0)}% of ${money(reserveTarget)} target` : "No target set"}
            footer={
              <div className="mt-3">
                {reserveTarget > 0 && <Progress value={reserveProgress} className="h-2" />}
                <button
                  onClick={() => navigate("/accounts")}
                  className="text-xs text-accent underline min-h-[44px] pt-2"
                >
                  Manage accounts
                </button>
              </div>
            } />
          {owedToOwner > 0 && (
            <Tile icon={HandCoins} title="Owed to You" tooltip={kpiTooltips.owedToYou}
              value={money(owedToOwner)} subtext="Expenses you paid personally" />
          )}
          <Tile icon={Package} title="Active Lots" tooltip={kpiTooltips.activeLots}
            value={`${Number(metrics?.active_lots || 0)}`} />
          <Tile icon={CreditCard} title="Listed Cards" tooltip={kpiTooltips.listedCards}
            value={`${Number(metrics?.listed_cards || 0)}`}
            subtext={`${money(metrics?.listed_cards_value)} at asking price`} />
          <div className="night-game-card p-4 md:p-6 relative">
            <Calendar className="h-7 w-7 md:h-8 md:w-8 text-accent mb-3 md:mb-4" />
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Upcoming Shows
            </h3>
            {loadingShowsCount ? (
              <Skeleton className="h-9 w-1/2 bg-muted/20" />
            ) : (
              <div className="text-2xl md:text-3xl font-bold text-foreground">{upcomingShowsCount}</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col md:flex-row gap-4">
        <Button 
          onClick={() => navigate("/transactions/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 min-h-[44px] rounded-lg font-semibold uppercase flex-1"
        >
          RECORD SALE
        </Button>
        <Button 
          onClick={() => navigate("/show-cards/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 min-h-[44px] rounded-lg font-semibold uppercase flex-1"
        >
          ADD SHOW CARD
        </Button>
        <Button 
          onClick={() => navigate("/shows/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 min-h-[44px] rounded-lg font-semibold uppercase flex-1"
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
                    {formatBusinessDate(show.show_date, "MMM dd, yyyy")}
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
