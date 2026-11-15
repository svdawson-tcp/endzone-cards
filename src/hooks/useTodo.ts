import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import type { TodoItem } from "@/lib/todo";

/** The To Do list, computed by get_todo: reminders, the monthly checkup, drive prompts and typed-in tasks. */
export function useTodo() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  return useQuery({
    queryKey: ["todo", viewingUserId],
    // the nav badge and the dashboard share this; saving anything that clears an item invalidates it
    staleTime: 15_000,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_todo", { p_user_id: userId });
      if (error) throw error;
      return (data || []) as unknown as TodoItem[];
    },
  });
}

/** Everything that can change what's on the list. */
export function useInvalidateTodo() {
  const queryClient = useQueryClient();
  return () => {
    ["todo", "reminders", "taxTracker", "trips", "mileageSummary", "checkup", "tasks"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
  };
}
