import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

/** website_settings row for the effective user, or null when this account doesn't own the website. */
export function useWebsiteSettings() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  return useQuery({
    queryKey: ["websiteSettings", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("website_settings")
        .select("owner_user_id, offers_enabled, offer_floor_pct, shipping_flat, hold_minutes, offer_hold_hours")
        .eq("owner_user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Counts for the navigation badges: offers waiting on Colton, paid orders not yet shipped. */
export function useWebShopCounts() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  return useQuery({
    queryKey: ["webShopCounts", viewingUserId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const [offers, orders] = await Promise.all([
        supabase
          .from("web_offers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "pending"),
        supabase
          .from("web_orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "paid")
          .is("shipped_at", null),
      ]);
      if (offers.error) throw offers.error;
      if (orders.error) throw orders.error;
      return { pendingOffers: offers.count || 0, ordersToShip: orders.count || 0 };
    },
  });
}
