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

  // Hardcoded mentee account for Colton - using correct user ID from database
  const menteeAccount = {
    userId: "440df399-17c0-46c7-b5ff-d9f3a2d87858", // Colton's actual user ID
    email: "denvernuggets0697@gmail.com"
  };

  // Only show switcher if currently in mentor mode or if account access exists
  // Simplified: always show for now since we hardcoded the mentee account
  const hasAccess = availableMenteeAccounts.length > 0 || isViewingAsMentor;
  
  if (!hasAccess) {
    console.log("AccountSwitcher hidden - no access", { 
      availableMenteeAccounts: availableMenteeAccounts.length,
      isViewingAsMentor 
    });
    return null;
  }

  console.log("AccountSwitcher visible", { 
    availableMenteeAccounts: availableMenteeAccounts.length,
    isViewingAsMentor,
    menteeAccount 
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isViewingAsMentor ? "secondary" : "outline"}
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
      <DropdownMenuContent align="end" className="w-56 bg-card border-border">
        <DropdownMenuLabel className="text-card-foreground">
          {isViewingAsMentor ? "Mentor View Mode" : "Account Switcher"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isViewingAsMentor && (
          <>
            <div className="px-2 py-1.5 text-sm text-card-foreground">
              Viewing: {viewingUserEmail}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={switchToOwnAccount} className="text-card-foreground">
              <User className="mr-2 h-4 w-4" />
              Return to My Account
            </DropdownMenuItem>
          </>
        )}

        {!isViewingAsMentor && (
          <>
            <DropdownMenuLabel className="text-xs text-card-foreground/70">
              Switch to Mentee Account
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => switchToMenteeAccount(menteeAccount.userId, menteeAccount.email)}
              className="text-card-foreground"
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
