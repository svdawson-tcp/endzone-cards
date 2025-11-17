import { useNavigate } from "react-router-dom";
import { LogOut, User, Settings, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

interface TopBarProps {
  onMenuToggle?: () => void;
  showMobileMenu?: boolean;
}

const TopBar = ({ onMenuToggle, showMobileMenu = false }: TopBarProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isViewingAsMentor, viewingUserEmail } = useMentorAccess();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
      toast({
        title: "Logged out successfully",
        description: "See you next time!",
      });
    } catch (error) {
      toast({
        title: "Error logging out",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Card variant="elevated" padding="sm" className="rounded-none border-x-0 border-t-0">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Logo and mobile menu */}
        <div className="flex items-center gap-3">
          {showMobileMenu && (
            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={onMenuToggle}
              className="lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          <button 
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">EZ</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-lg text-foreground">EndZone</h1>
              <p className="text-xs text-muted-foreground -mt-1">Your Gameplan to Profit</p>
            </div>
          </button>
        </div>

        {/* Right: Account controls */}
        <div className="flex items-center gap-2">
          <AccountSwitcher />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="relative"
              >
                <User className="w-5 h-5" />
                {isViewingAsMentor && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-2 border-surface" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {isViewingAsMentor && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-1">
                  Viewing: {viewingUserEmail}
                </div>
              )}
              <DropdownMenuItem disabled className="cursor-not-allowed opacity-50">
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="cursor-not-allowed opacity-50">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
};

export default TopBar;
