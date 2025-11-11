import { useNavigate } from "react-router-dom";
import { LogOut, User, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/endzone-logo-main.png";

const TopBar = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

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
    <header className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <button 
          onClick={() => navigate("/dashboard")}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <img src={logo} alt="EndZone Logo" className="h-14 cursor-pointer" />
        </button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full">
              <Avatar className="h-10 w-10 cursor-pointer">
                <AvatarImage src="" />
                <AvatarFallback className="bg-[hsl(var(--navy-base))] text-white">
                  <User size={20} />
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled className="cursor-not-allowed opacity-50">
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="cursor-not-allowed opacity-50">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;
