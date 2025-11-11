import { Home, Package, Plus, CreditCard, Calendar } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { icon: Home, label: "Home", route: "/dashboard" },
    { icon: Package, label: "Lots", route: "/lots" },
    { icon: Plus, label: "Add", route: "/transactions/new", isCenter: true },
    { icon: CreditCard, label: "Cards", route: "/show-cards" },
    { icon: Calendar, label: "Shows", route: "/shows" },
  ];

  const handleTabClick = (route: string) => {
    navigate(route);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)] pt-2 md:hidden"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-5 items-end gap-1 max-w-7xl mx-auto px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.route;

          if (tab.isCenter) {
            return (
              <button
                key={tab.route}
                onClick={() => handleTabClick(tab.route)}
                className="flex flex-col items-center justify-center -translate-y-4 cursor-pointer"
                aria-label={tab.label}
              >
                <div className="bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95">
                  <Icon className="text-white" size={28} />
                </div>
              </button>
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
