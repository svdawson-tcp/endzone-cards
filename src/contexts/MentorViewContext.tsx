import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';

interface MentorViewContextType {
  viewingUserId: string | null;
  isInMentorView: boolean;
  exitMentorView: () => void;
}

const MentorViewContext = createContext<MentorViewContextType | undefined>(undefined);

export function MentorViewProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  useEffect(() => {
    const userId = searchParams.get('viewingUserId');
    setViewingUserId(userId);
  }, [searchParams, location]);

  const exitMentorView = () => {
    searchParams.delete('viewingUserId');
    setSearchParams(searchParams);
    setViewingUserId(null);
  };

  return (
    <MentorViewContext.Provider value={{
      viewingUserId,
      isInMentorView: !!viewingUserId,
      exitMentorView
    }}>
      {children}
    </MentorViewContext.Provider>
  );
}

export function useMentorView() {
  const context = useContext(MentorViewContext);
  if (context === undefined) {
    throw new Error('useMentorView must be used within MentorViewProvider');
  }
  return context;
}
