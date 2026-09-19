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

const MENTOR_VIEW_STORAGE_KEY = "mentorView";

type StoredMentorView = { userId: string; email: string; sessionId: string };

const readStoredMentorView = (): StoredMentorView | null => {
  try {
    const raw = sessionStorage.getItem(MENTOR_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId && parsed?.sessionId) return parsed as StoredMentorView;
    return null;
  } catch {
    return null;
  }
};

const writeStoredMentorView = (value: StoredMentorView) => {
  try {
    sessionStorage.setItem(MENTOR_VIEW_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const clearStoredMentorView = () => {
  try {
    sessionStorage.removeItem(MENTOR_VIEW_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

export function MentorAccessProvider({ children }: { children: ReactNode }) {
  const [isViewingAsMentor, setIsViewingAsMentor] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingUserEmail, setViewingUserEmail] = useState<string | null>(null);
  const [availableMenteeAccounts, setAvailableMenteeAccounts] = useState<MenteeAccount[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Fetch available mentee accounts and restore a saved mentor view (survives refresh)
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          clearStoredMentorView();
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
          const accounts: MenteeAccount[] = mentorAccess.map(access => ({
            userId: access.mentee_user_id,
            email: "", // Email is hardcoded in AccountSwitcher
            accessLevel: access.access_level,
          }));

          setAvailableMenteeAccounts(accounts);
        }

        // Restore a saved mentor view only when access and session are still valid
        const stored = readStoredMentorView();
        if (stored) {
          const nowIso = new Date().toISOString();
          const { data: access } = await supabase
            .from("mentor_access")
            .select("id, expires_at")
            .eq("mentor_user_id", user.id)
            .eq("mentee_user_id", stored.userId)
            .eq("is_active", true)
            .maybeSingle();

          const accessValid = !!access && (!access.expires_at || access.expires_at > nowIso);

          const { data: session } = await supabase
            .from("mentor_sessions")
            .select("id, is_active")
            .eq("id", stored.sessionId)
            .eq("mentor_user_id", user.id)
            .eq("mentee_user_id", stored.userId)
            .maybeSingle();

          if (accessValid && session?.is_active) {
            setIsViewingAsMentor(true);
            setViewingUserId(stored.userId);
            setViewingUserEmail(stored.email);
            setCurrentSessionId(stored.sessionId);
          } else {
            clearStoredMentorView();
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Error initialising mentor access:", error);
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const switchToMenteeAccount = async (userId: string, email: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Verify mentor has access to this mentee
      const { data: accessCheck, error: accessError } = await supabase
        .from("mentor_access")
        .select("*")
        .eq("mentor_user_id", user.id)
        .eq("mentee_user_id", userId)
        .eq("is_active", true)
        .single();

      if (accessError || !accessCheck) {
        throw new Error("No active mentor access found for this account");
      }

      // Create a new mentor session
      const { data: session, error: sessionError } = await supabase
        .from("mentor_sessions")
        .insert({
          mentor_user_id: user.id,
          mentee_user_id: userId,
          is_active: true,
        })
        .select()
        .single();

      if (sessionError) {
        console.error("Session creation error details:", sessionError);
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

      setIsViewingAsMentor(true);
      setViewingUserId(userId);
      setViewingUserEmail(email);
      setCurrentSessionId(session.id);
      writeStoredMentorView({ userId, email, sessionId: session.id });

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

      clearStoredMentorView();
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

  // Clear the saved view on sign-out
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearStoredMentorView();
        setIsViewingAsMentor(false);
        setViewingUserId(null);
        setViewingUserEmail(null);
        setCurrentSessionId(null);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

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
      return viewingUserId;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
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
