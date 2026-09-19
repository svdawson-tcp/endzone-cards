import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

export interface CashAccount {
  id: string;
  name: string;
  kind: string;
  target_amount: number | null;
  is_default: boolean;
  sort_order: number;
}

/** Non-archived cash accounts for the effective user, ordered by sort_order. */
export function useCashAccounts() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();

  return useQuery({
    queryKey: ["cash_accounts", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("id, name, kind, target_amount, is_default, sort_order")
        .eq("user_id", userId)
        .eq("archived", false)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []) as CashAccount[];
    },
  });
}
