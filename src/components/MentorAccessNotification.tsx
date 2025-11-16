import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye } from "lucide-react";
import { toast } from "sonner";

export function MentorAccessNotification() {
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    const checkActiveSessions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check for active mentor sessions
      const { data: sessions } = await supabase
        .from("mentor_sessions")
        .select("*")
        .eq("mentee_user_id", user.id)
        .eq("is_active", true);

      if (sessions && sessions.length > 0) {
        setHasActiveSession(true);
        // Show notification
        toast("Mentor Access Active", {
          description: "Your business mentor is currently viewing your account",
          icon: <Eye className="h-4 w-4" />,
          duration: Infinity,
        });
      }
    };

    checkActiveSessions();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("mentor-sessions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mentor_sessions",
        },
        async (payload) => {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          if (payload.eventType === "INSERT") {
            const session = payload.new as any;
            if (session.mentee_user_id === user.id && session.is_active) {
              setHasActiveSession(true);
              toast("Mentor Access Active", {
                description: "Your business mentor is currently viewing your account",
                icon: <Eye className="h-4 w-4" />,
                duration: Infinity,
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const session = payload.new as any;
            if (session.mentee_user_id === user.id && !session.is_active) {
              setHasActiveSession(false);
              toast.dismiss();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null; // This component only manages notifications
}
