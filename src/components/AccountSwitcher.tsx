import { Eye, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

export function AccountSwitcher() {
  const {
    isViewingAsMentor,
    viewingUserEmail,
    availableMenteeAccounts,
    switchToMenteeAccount,
    switchToOwnAccount,
  } = useMentorAccess();

  // Hardcoded mentee account for Colton since we granted access in the migration
  const menteeAccount = {
    userId: "9e3c1fbc-19cb-4cf7-a43b-a859a1e1e3e0", // Colton's user ID from auth
    email: "denvernuggets0697@gmail.com"
  };

  // Only show switcher if user has mentor access
  if (availableMenteeAccounts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isViewingAsMentor ? "secondary" : "ghost"}
          size="icon"
          className="h-9 w-9"
        >
          {isViewingAsMentor ? (
            <Eye className="h-5 w-5" />
          ) : (
            <User className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {isViewingAsMentor ? "Mentor View Mode" : "Account Switcher"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isViewingAsMentor && (
          <>
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Viewing: {viewingUserEmail}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={switchToOwnAccount}>
              <User className="mr-2 h-4 w-4" />
              Return to My Account
            </DropdownMenuItem>
          </>
        )}

        {!isViewingAsMentor && availableMenteeAccounts.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Switch to Mentee Account
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => switchToMenteeAccount(menteeAccount.userId, menteeAccount.email)}
            >
              <Eye className="mr-2 h-4 w-4" />
              {menteeAccount.email}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
