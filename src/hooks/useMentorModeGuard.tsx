import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { toast } from "sonner";

export function useMentorModeGuard() {
  const { isViewingAsMentor } = useMentorAccess();

  const preventMutation = (action: () => void) => {
    if (isViewingAsMentor) {
      toast.error("Action Disabled", {
        description: "Cannot edit data while in mentor view mode",
      });
      return;
    }
    action();
  };

  const preventMutationAsync = async (action: () => Promise<void>) => {
    if (isViewingAsMentor) {
      toast.error("Action Disabled", {
        description: "Cannot edit data while in mentor view mode",
      });
      return;
    }
    await action();
  };

  return {
    isViewingAsMentor,
    preventMutation,
    preventMutationAsync,
  };
}
