import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ImageIcon, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ShowCards = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: showCards = [], isLoading } = useQuery({
    queryKey: ["show-cards"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("show_cards")
        .select(`
          *,
          lots!show_cards_lot_id_fkey(source),
          transactions!left(transaction_date)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const filteredCards = useMemo(() => {
    let filtered = showCards;

    if (statusFilter !== "all") {
      filtered = filtered.filter(card => card.status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(card =>
        card.player_name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  }, [showCards, statusFilter, searchQuery]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "available":
        return "default";
      case "sold":
        return "outline";
      case "combined":
        return "secondary";
      case "lost":
        return "destructive";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--bg-page))] flex items-center justify-center">
        <div className="text-[hsl(var(--text-body))]">Loading show cards...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--bg-page))]">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="page-title">SHOW CARDS</h1>
          <Button
            onClick={() => navigate("/show-cards/new")}
            className="min-h-[44px] bg-[#041E42] hover:bg-[#0A2E63] text-white font-semibold uppercase"
          >
            ADD SHOW CARD
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Search */}
            <Input
              placeholder="Search by player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-h-[44px]"
            />

            {/* Status Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto">
              {[
                { value: "all", label: "All" },
                { value: "available", label: "Available" },
                { value: "sold", label: "Sold" },
                { value: "combined", label: "Combined/Lost" },
              ].map((filter) => (
                <Button
                  key={filter.value}
                  variant={statusFilter === filter.value ? "default" : "outline"}
                  onClick={() => setStatusFilter(filter.value)}
                  className="min-h-[44px] whitespace-nowrap"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cards Grid */}
        {showCards.length === 0 ? (
          <div className="text-center py-12">
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-6">
                <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-h3 mb-2">No Show Cards Yet</h3>
                <p className="text-[hsl(var(--text-body))] mb-4">Add your first premium card to start tracking inventory</p>
                <Button onClick={() => navigate("/show-cards/new")}>ADD SHOW CARD</Button>
              </CardContent>
            </Card>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-12">
            <Card className="max-w-md mx-auto">
              <CardContent className="pt-6">
                <p className="text-[hsl(var(--text-body))]">No cards match your filters</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCards.map((card) => (
              <Card
                key={card.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/show-cards/${card.id}`)}
              >
                <CardContent className="p-4">
                  {/* Photo */}
                  {card.photo_front_url ? (
                    <img
                      src={card.photo_front_url}
                      className="w-full h-64 object-cover rounded-lg mb-3"
                      alt={`${card.player_name} card front`}
                    />
                  ) : (
                    <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center mb-3">
                      <ImageIcon className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}

                  {/* Card Info */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{card.player_name}</h3>
                        <p className="text-sm text-[hsl(var(--text-body))]">{card.year}</p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(card.status)}>
                        {card.status}
                      </Badge>
                    </div>

                    <p className="text-xs text-[hsl(var(--text-secondary))]">From: {card.lots?.source}</p>

                    {card.status === "sold" && (card as any).transactions?.[0]?.transaction_date && (
                      <p className="text-xs text-[hsl(var(--text-secondary))]">
                        Sold: {new Date((card as any).transactions[0].transaction_date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </p>
                    )}

                    {card.status === "available" && card.asking_price && (
                      <p className="text-sm font-semibold text-[hsl(var(--metric-positive))]">
                        Asking: ${Number(card.asking_price).toFixed(2)}
                      </p>
                    )}

                    {card.status === "sold" && (
                      <p className="text-sm font-semibold text-[hsl(var(--text-body))]">SOLD</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShowCards;
