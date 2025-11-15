import { Home, Package, Plus, CreditCard, Calendar, DollarSign, Trash2, Receipt, TrendingDown, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tabs = [
    { icon: Home, label: "Home", route: "/dashboard" },
    { icon: Package, label: "Lots", route: "/lots" },
    { icon: Plus, label: "Add", route: "/transactions/new", isCenter: true },
    { icon: CreditCard, label: "Cards", route: "/show-cards" },
    { icon: Calendar, label: "Shows", route: "/shows" },
    { icon: Receipt, label: "History", route: "/transactions" },
  ];

  const quickAddItems = [
    { 
      icon: DollarSign, 
      label: "Show Card Sale", 
      description: "Sell a premium card",
      route: "/show-cards" 
    },
    { 
      icon: Package, 
      label: "Bulk Sale", 
      description: "Sell common cards in bulk",
      route: "/transactions/bulk-sale/new" 
    },
    { 
      icon: Trash2, 
      label: "Disposition", 
      description: "Mark cards as lost/discarded",
      route: "/transactions/disposition/new" 
    },
    { 
      icon: Receipt, 
      label: "Record Expense", 
      description: "Track business expenses",
      route: "/expenses/create" 
    },
    { 
      icon: DollarSign, 
      label: "Cash Deposit", 
      description: "Add cash from external source",
      route: "/cash/new?type=deposit" 
    },
    { 
      icon: TrendingDown, 
      label: "Cash Withdrawal", 
      description: "Remove cash for personal use",
      route: "/cash/new?type=withdrawal" 
    },
    { 
      icon: Settings, 
      label: "Cash Adjustment", 
      description: "Correct balance discrepancies",
      route: "/cash/new?type=adjustment" 
    },
  ];

  const handleTabClick = (route: string) => {
    navigate(route);
  };

  const handleQuickAddClick = (route: string) => {
    setSheetOpen(false);
    navigate(route);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)] pt-2 md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-6 items-end gap-1 max-w-7xl mx-auto px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.route;

          if (tab.isCenter) {
            return (
              <Sheet key={tab.route} open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <button
                    className="flex flex-col items-center justify-center -translate-y-4 cursor-pointer"
                    aria-label={tab.label}
                  >
                    <div className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95">
                      <Icon className="text-white" size={28} />
                    </div>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
                  <SheetHeader className="flex-shrink-0">
                    <SheetTitle className="text-gray-900 text-xl font-bold">Quick Add</SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto touch-pan-y flex-1 py-6">
                    <div className="grid gap-3">
                      {quickAddItems.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.route}
                          onClick={() => handleQuickAddClick(item.route)}
                          className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left min-h-[60px]"
                        >
                          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[hsl(var(--navy-base))] flex items-center justify-center">
                            <ItemIcon className="text-white" size={20} />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{item.label}</p>
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

          return (
            <button
              key={tab.route}
              onClick={() => handleTabClick(tab.route)}
              className={cn(
                "flex flex-col items-center justify-center py-2 px-3 cursor-pointer rounded-lg transition-all duration-200 min-h-[44px]",
                isActive
                  ? "bg-[hsl(var(--star-gold))]/10"
                  : "hover:bg-muted/50"
              )}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "transition-colors",
                  isActive
                    ? "text-[hsl(var(--navy-base))]"
                    : "text-muted-foreground"
                )}
                size={24}
              />
              <span
                className={cn(
                  "text-xs mt-1 transition-colors",
                  isActive
                    ? "text-[hsl(var(--navy-base))] font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomTabBar;
