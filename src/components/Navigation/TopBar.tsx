import { useNavigate } from "react-router-dom";
import { LogOut, User, Settings, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import endzoneLogo from "@/assets/endzone-logo-full.png";
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
    <div 
      className="fixed top-0 left-0 right-0 z-50 shadow-sm"
      style={{
        backgroundImage: 'url(/images/endzone-3d-header.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        minHeight: '80px'
      }}
    >
      <div className="flex items-center justify-between h-20 px-4">
        {/* Left: Mobile menu button only */}
        <div className="flex items-center gap-3">
          {showMobileMenu && (
            <Button 
              variant="ghost" 
              size="icon-sm"
              onClick={onMenuToggle}
              className="lg:hidden text-white hover:bg-white/10"
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Right: Account controls */}
        <div className="flex items-center gap-2">
          <AccountSwitcher />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="relative text-white hover:bg-white/10"
              >
                <User className="w-5 h-5" />
                {isViewingAsMentor && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-2 border-white" />
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
    </div>
  );
};

export default TopBar;
