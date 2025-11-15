import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Package, CreditCard, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import dashboardBg from "@/assets/backgrounds/dashboard-stadium-bg.jpg";

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Cash Balance Query
  const { data: cashBalance, isLoading: loadingCash } = useQuery({
    queryKey: ["cashBalance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("amount")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id);
      
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    },
  });

  // Monthly Revenue Query
  const { data: monthlyRevenue, isLoading: loadingRevenue } = useQuery({
    queryKey: ["monthlyRevenue"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("transactions")
        .select("revenue")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .gte("created_at", startOfMonth.toISOString());
      
      if (error) throw error;
      return data?.reduce((sum, t) => sum + Number(t.revenue), 0) || 0;
    },
  });

  // Active Lots Query
  const { data: activeLots, isLoading: loadingLots } = useQuery({
    queryKey: ["activeLots"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lots")
        .select("*", { count: "exact", head: true })
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .eq("status", "active");
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Available Show Cards Query
  const { data: availableCards, isLoading: loadingCards } = useQuery({
    queryKey: ["availableCards"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("show_cards")
        .select("*", { count: "exact", head: true })
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .eq("status", "available");
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Upcoming Shows Query
  const { data: upcomingShowsCount, isLoading: loadingShowsCount } = useQuery({
    queryKey: ["upcomingShowsCount"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("shows")
        .select("*", { count: "exact", head: true })
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .in("status", ["planned", "active"]);
      
      if (error) throw error;
      return count || 0;
    },
  });

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
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed relative"
      style={{ backgroundImage: `url(${dashboardBg})` }}
    >
      <div className="absolute inset-0 bg-black/75" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <section className="text-center mb-12">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
            CURRENT CASH BALANCE
          </h2>
          {loadingCash ? (
            <Skeleton className="h-20 w-64 mx-auto mb-2" />
          ) : (
            <div className="text-display text-[hsl(var(--star-gold))] mb-2">
              ${(cashBalance || 0).toFixed(2)}
            </div>
          )}
          <p className="text-muted-foreground">Your Gameplan to Profit</p>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-card shadow-card-shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="h-8 w-8 text-[hsl(var(--star-gold))]" />
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              TOTAL REVENUE (THIS MONTH)
            </p>
            {loadingRevenue ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-3xl font-bold text-card-foreground">
                ${(monthlyRevenue || 0).toFixed(2)}
              </p>
            )}
          </div>

          <div className="bg-card shadow-card-shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <Package className="h-8 w-8 text-[hsl(var(--star-gold))]" />
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              ACTIVE LOTS
            </p>
            {loadingLots ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-card-foreground">{activeLots}</p>
            )}
          </div>

          <div className="bg-card shadow-card-shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <CreditCard className="h-8 w-8 text-[hsl(var(--star-gold))]" />
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              SHOW CARDS AVAILABLE
            </p>
            {loadingCards ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-card-foreground">{availableCards}</p>
            )}
          </div>

          <div className="bg-card shadow-card-shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <Calendar className="h-8 w-8 text-[hsl(var(--star-gold))]" />
            </div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              UPCOMING SHOWS
            </p>
            {loadingShowsCount ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold text-card-foreground">{upcomingShowsCount}</p>
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="flex flex-col md:flex-row gap-4 mb-12">
          <Button 
            onClick={() => navigate("/transactions/new")}
            className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white px-6 py-3 rounded-lg font-semibold uppercase flex-1"
          >
            RECORD SALE
          </Button>
          <Button 
            onClick={() => navigate("/show-cards/new")}
            className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white px-6 py-3 rounded-lg font-semibold uppercase flex-1"
          >
            ADD SHOW CARD
          </Button>
          <Button 
            onClick={() => navigate("/shows/new")}
            className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white px-6 py-3 rounded-lg font-semibold uppercase flex-1"
          >
            CREATE SHOW
          </Button>
        </section>

        {/* Recent Activity */}
        <section className="mb-12">
          {/* Page Title - Uses page-title class for white text on dark background */}
          <h2 className="page-title mb-4">RECENT ACTIVITY</h2>
          <div className="bg-card shadow-card-shadow rounded-lg p-6 overflow-x-auto">
            {loadingActivity ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !recentActivity || recentActivity.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No transactions yet. Record your first sale!
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground uppercase">Date</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground uppercase">Type</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground uppercase">Description</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-muted-foreground uppercase">Amount</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-muted-foreground uppercase">Show</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((transaction: any) => (
                    <tr key={transaction.id} className="border-b border-border/50">
                      <td className="py-3 px-2 text-sm text-gray-900">
                        {format(new Date(transaction.created_at), "MM/dd/yy")}
                      </td>
                      <td className="py-3 px-2">
                        {getTransactionTypeBadge(transaction.transaction_type)}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-900">
                        {transaction.show_cards?.player_name || transaction.lots?.source || "—"}
                      </td>
                      <td className="py-3 px-2 text-sm text-right text-green-600">
                        ${Number(transaction.revenue).toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-900">
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
          {/* Page Title - Uses page-title class for white text on dark background */}
          <h2 className="page-title mb-4">UPCOMING SHOWS</h2>
          {loadingShows ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : !upcomingShows || upcomingShows.length === 0 ? (
            <div className="bg-card shadow-card-shadow rounded-lg p-6 text-center">
              <p className="text-muted-foreground mb-4">No upcoming shows. Create your first show!</p>
              <Button onClick={() => navigate("/shows/new")}>Create Show</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {upcomingShows.map((show: any) => (
                  <div key={show.id} className="bg-card shadow-card-shadow rounded-lg p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="card-title text-sm">{show.name}</h3>
                      {getStatusBadge(show.status)}
                    </div>
                    <p className="text-sm text-gray-900 mb-1">
                      {format(new Date(show.show_date), "MMM dd, yyyy")}
                    </p>
                    <p className="text-sm text-gray-600 mb-3">
                      {show.location || "Location TBD"}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
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
