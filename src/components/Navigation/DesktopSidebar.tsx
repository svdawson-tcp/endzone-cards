import { Home, Package, Plus, CreditCard, Calendar, DollarSign, Trash2, ChevronDown, Receipt, TrendingDown, Settings, TrendingUp, BookOpen, Heart, CheckSquare, BookText, Target } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import logo from "@/assets/endzone-logo-main.png";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [transactionsOpen, setTransactionsOpen] = useState(true);
  const [goalsOpen, setGoalsOpen] = useState(true);

  const navItems = [
    { icon: Home, label: "Dashboard", route: "/dashboard" },
    { icon: Package, label: "Lots", route: "/lots" },
    { icon: CreditCard, label: "Show Cards", route: "/show-cards" },
    { icon: Calendar, label: "Shows", route: "/shows" },
    { icon: Receipt, label: "Transaction History", route: "/transactions" },
  ];

  const transactionItems = [
    { icon: DollarSign, label: "Show Card Sale", route: "/show-cards", description: "Select card to sell" },
    { icon: Package, label: "Bulk Sale", route: "/transactions/bulk-sale/new" },
    { icon: Trash2, label: "Disposition", route: "/transactions/disposition/new" },
    { icon: Receipt, label: "Record Expense", route: "/expenses/new", description: "Track business expenses" },
    { icon: DollarSign, label: "Cash Deposit", route: "/cash/new?type=deposit" },
    { icon: TrendingDown, label: "Cash Withdrawal", route: "/cash/new?type=withdrawal" },
    { icon: Settings, label: "Cash Adjustment", route: "/cash/new?type=adjustment" },
  ];

  const goalItems = [
    { icon: BookOpen, label: "Business Model", route: "/goals/business-model" },
    { icon: Heart, label: "Personal Goals", route: "/goals/personal" },
    { icon: TrendingUp, label: "Business Goals", route: "/goals/business" },
    { icon: CheckSquare, label: "Action Planning", route: "/goals/actions" },
  ];

  const handleNavClick = (route: string) => {
    navigate(route);
  };

  return (
    <aside className="hidden md:block fixed left-0 top-0 h-screen w-60 bg-card border-r border-border z-30">
      <div className="flex flex-col h-full">
        {/* Logo Section - Fixed */}
        <div className="shrink-0 py-4 px-4">
          <img src={logo} alt="EndZone - Your Gameplan to Profit" className="h-16 w-auto" />
        </div>

        {/* Scrollable Navigation Content */}
        <div className="flex-1 overflow-y-auto">
          <nav className="px-3 py-4">
        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.route;

            return (
              <button
                key={item.route}
                onClick={() => handleNavClick(item.route)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground border-l-4 border-accent"
                    : "text-card-foreground hover:bg-muted/50"
                )}
              >
                <Icon
                  size={24}
                  className={isActive ? "text-accent" : "text-muted-foreground"}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}

          {/* Transactions Section */}
          <Collapsible open={transactionsOpen} onOpenChange={setTransactionsOpen} className="mt-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 rounded-lg hover:bg-muted/50 transition-all group">
              <div className="flex items-center gap-3">
                <Plus size={24} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-card-foreground">Quick Add</span>
              </div>
              <ChevronDown 
                size={16} 
                className={cn(
                  "text-muted-foreground transition-transform",
                  transactionsOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <div className="flex flex-col gap-1 pl-4">
                {transactionItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.route;

                  return (
                    <button
                      key={item.route}
                      onClick={() => handleNavClick(item.route)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all text-sm",
                        isActive
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-card-foreground"
                      )}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Goals Section - Collapsible */}
          <Collapsible open={goalsOpen} onOpenChange={setGoalsOpen} className="mt-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 rounded-lg hover:bg-muted/50 transition-all group">
              <div className="flex items-center gap-3">
                <Target size={24} className="text-muted-foreground" />
                <span className="text-sm font-semibold text-card-foreground">Goals</span>
              </div>
              <ChevronDown 
                size={16} 
                className={cn(
                  "text-muted-foreground transition-transform",
                  goalsOpen && "rotate-180"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <div className="flex flex-col gap-1 pl-4">
                {goalItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.route;

                  return (
                    <button
                      key={item.route}
                      onClick={() => handleNavClick(item.route)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-all text-sm",
                        isActive
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-card-foreground"
                      )}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Business Glossary - Separate Item */}
          <button
            onClick={() => handleNavClick("/glossary")}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all w-full mt-4",
              location.pathname === "/glossary"
                ? "bg-primary text-primary-foreground border-l-4 border-accent"
                : "text-card-foreground hover:bg-muted/50"
            )}
          >
            <BookText
              size={24}
              className={location.pathname === "/glossary" ? "text-white" : "text-muted-foreground"}
            />
            <span className="text-sm font-medium">Business Glossary</span>
          </button>
        </div>
      </nav>
        </div>
      </div>
    </aside>
  );
};

export default DesktopSidebar;
