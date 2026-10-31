import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Counts for the nav: offers waiting for an answer and paid website orders waiting to ship. */
export function useWebsiteBadges() {
  const { data } = useQuery({
    queryKey: ["website-badges"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const [offers, orders] = await Promise.all([
        supabase
          .from("shop_offers")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gt("respond_by", now),
        supabase.from("shop_orders").select("id", { count: "exact", head: true }).eq("status", "paid"),
      ]);
      return { offers: offers.count ?? 0, orders: orders.count ?? 0 };
    },
  });
  return data ?? { offers: 0, orders: 0 };
}
