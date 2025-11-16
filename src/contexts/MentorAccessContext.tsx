import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MenteeAccount {
  userId: string;
  email: string;
  accessLevel: string;
}

interface MentorAccessContextType {
  isViewingAsMentor: boolean;
  viewingUserId: string | null;
  viewingUserEmail: string | null;
  availableMenteeAccounts: MenteeAccount[];
  switchToMenteeAccount: (userId: string, email: string) => Promise<void>;
  switchToOwnAccount: () => void;
  logActivity: (action: string, pagePath: string) => Promise<void>;
  getEffectiveUserId: () => Promise<string>;
  isLoading: boolean;
}

const MentorAccessContext = createContext<MentorAccessContextType | undefined>(undefined);

export function MentorAccessProvider({ children }: { children: ReactNode }) {
  const [isViewingAsMentor, setIsViewingAsMentor] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingUserEmail, setViewingUserEmail] = useState<string | null>(null);
  const [availableMenteeAccounts, setAvailableMenteeAccounts] = useState<MenteeAccount[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Fetch available mentee accounts
  useEffect(() => {
    const fetchMenteeAccounts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data: mentorAccess, error } = await supabase
          .from("mentor_access")
          .select("mentee_user_id, access_level")
          .eq("mentor_user_id", user.id)
          .eq("is_active", true);

        if (error) throw error;

        if (mentorAccess && mentorAccess.length > 0) {
          // Map to accounts (email will be hardcoded in component)
          const accounts: MenteeAccount[] = mentorAccess.map(access => ({
            userId: access.mentee_user_id,
            email: "", // Email is hardcoded in AccountSwitcher
            accessLevel: access.access_level,
          }));

          setAvailableMenteeAccounts(accounts);
        }
        setIsLoading(false);
      } catch (error) {
        console.error("Error fetching mentee accounts:", error);
        setIsLoading(false);
      }
    };

    fetchMenteeAccounts();
  }, []);

  const switchToMenteeAccount = async (userId: string, email: string) => {
    try {
      console.log("Starting mentor switch to:", userId, email);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      console.log("Current user (mentor):", user.id);

      // Verify mentor has access to this mentee
      const { data: accessCheck, error: accessError } = await supabase
        .from("mentor_access")
        .select("*")
        .eq("mentor_user_id", user.id)
        .eq("mentee_user_id", userId)
        .eq("is_active", true)
        .single();

      console.log("Access check result:", accessCheck, accessError);
      
      if (accessError || !accessCheck) {
        throw new Error("No active mentor access found for this account");
      }

      // Create a new mentor session
      console.log("Creating mentor session...");
      const { data: session, error: sessionError } = await supabase
        .from("mentor_sessions")
        .insert({
          mentor_user_id: user.id,
          mentee_user_id: userId,
          is_active: true,
        })
        .select()
        .single();

      console.log("Session creation result:", session, sessionError);
      
      if (sessionError) {
        console.error("Session creation error details:", sessionError);
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

      setIsViewingAsMentor(true);
      setViewingUserId(userId);
      setViewingUserEmail(email);
      setCurrentSessionId(session.id);

      toast({
        title: "Switched to Mentor View",
        description: `Now viewing ${email}'s account (read-only)`,
      });
    } catch (error: any) {
      console.error("Error switching to mentee account:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to switch to mentee account",
        variant: "destructive",
      });
    }
  };

  const switchToOwnAccount = async () => {
    try {
      // Deactivate the current session
      if (currentSessionId) {
        await supabase
          .from("mentor_sessions")
          .update({ is_active: false })
          .eq("id", currentSessionId);
      }

      setIsViewingAsMentor(false);
      setViewingUserId(null);
      setViewingUserEmail(null);
      setCurrentSessionId(null);

      toast({
        title: "Returned to Your Account",
        description: "You are now viewing your own account",
      });
    } catch (error) {
      console.error("Error switching back:", error);
    }
  };

  const logActivity = async (action: string, pagePath: string) => {
    if (!isViewingAsMentor || !viewingUserId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("mentor_activity_log").insert({
        mentor_user_id: user.id,
        mentee_user_id: viewingUserId,
        action,
        page_path: pagePath,
      });

      // Update last activity in session
      if (currentSessionId) {
        await supabase
          .from("mentor_sessions")
          .update({ last_activity: new Date().toISOString() })
          .eq("id", currentSessionId);
      }
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  };

  // Log activity on route changes
  useEffect(() => {
    if (isViewingAsMentor) {
      logActivity("page_view", window.location.pathname);
    }
  }, [isViewingAsMentor, window.location.pathname]);

  // Helper to get effective user ID for queries
  const getEffectiveUserId = async (): Promise<string> => {
    if (isViewingAsMentor && viewingUserId) {
      console.log("Using mentor view user ID:", viewingUserId);
      return viewingUserId;
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    console.log("Using own user ID:", user.id);
    return user.id;
  };

  return (
    <MentorAccessContext.Provider
      value={{
        isViewingAsMentor,
        viewingUserId,
        viewingUserEmail,
        availableMenteeAccounts,
        switchToMenteeAccount,
        switchToOwnAccount,
        logActivity,
        getEffectiveUserId,
        isLoading,
      }}
    >
      {children}
    </MentorAccessContext.Provider>
  );
}

export function useMentorAccess() {
  const context = useContext(MentorAccessContext);
  if (context === undefined) {
    throw new Error("useMentorAccess must be used within a MentorAccessProvider");
  }
  return context;
}
