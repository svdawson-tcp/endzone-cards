import { useNavigate } from 'react-router-dom';
import { useMentorView } from '@/contexts/MentorViewContext';

/**
 * Custom hook that wraps useNavigate to preserve mentor view context
 * Automatically appends viewingUserId parameter when navigating in mentor mode
 */
export function useNavigateWithMentorView() {
  const navigate = useNavigate();
  const { viewingUserId } = useMentorView();

  const navigateWithMentorView = (path: string) => {
    const params = viewingUserId ? `?viewingUserId=${viewingUserId}` : "";
    navigate(`${path}${params}`);
  };

  return navigateWithMentorView;
}
