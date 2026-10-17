import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

/** money_settings row for the effective user, or null before first-use setup. */
export function useMoneySettings() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  return useQuery({
    queryKey: ["moneySettings", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.from("money_settings").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
