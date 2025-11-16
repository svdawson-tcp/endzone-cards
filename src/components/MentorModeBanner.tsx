import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

export function MentorModeBanner() {
  const { isViewingAsMentor, viewingUserEmail, switchToOwnAccount } = useMentorAccess();

  if (!isViewingAsMentor) return null;

  return (
    <div className="sticky top-16 z-40 bg-amber-500/90 backdrop-blur-sm border-b border-amber-600">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-amber-950" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="font-semibold text-amber-950">Mentor View Mode</span>
              <span className="text-sm text-amber-950/80">
                Viewing {viewingUserEmail}'s account (read-only)
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={switchToOwnAccount}
            className="text-amber-950 hover:bg-amber-600/20"
          >
            <X className="h-4 w-4 mr-2" />
            Exit Mentor View
          </Button>
        </div>
      </div>
    </div>
  );
}
