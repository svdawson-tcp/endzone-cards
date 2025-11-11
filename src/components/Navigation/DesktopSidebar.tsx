import { Home, Package, Plus, CreditCard, Calendar } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import logo from "@/assets/endzone-logo-light.png";

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { icon: Home, label: "Dashboard", route: "/dashboard" },
    { icon: Package, label: "Lots", route: "/lots" },
    { icon: Plus, label: "Quick Add", route: "/transactions/new", isQuickAdd: true },
    { icon: CreditCard, label: "Show Cards", route: "/show-cards" },
    { icon: Calendar, label: "Shows", route: "/shows" },
  ];

  const handleNavClick = (route: string) => {
    navigate(route);
  };

  return (
    <aside className="hidden md:block fixed left-0 top-0 h-screen w-60 bg-card border-r border-border z-30">
      {/* Logo Section */}
      <div className="py-6 px-4">
        <img src={logo} alt="EndZone Logo" className="h-12" />
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 px-3 py-4">
        <div className="flex flex-col gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.route;
            const isQuickAdd = item.isQuickAdd;

            if (isQuickAdd) {
              return (
                <button
                  key={item.route}
                  onClick={() => handleNavClick(item.route)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all bg-[hsl(var(--navy-base))] hover:bg-[hsl(var(--navy-light))] text-white"
                >
                  <Icon size={28} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            }

            return (
              <button
                key={item.route}
                onClick={() => handleNavClick(item.route)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all",
                  isActive
                    ? "bg-[hsl(var(--navy-base))] text-white border-l-4 border-[hsl(var(--star-gold))]"
                    : "text-foreground hover:bg-muted/50"
                )}
              >
                <Icon
                  size={24}
                  className={isActive ? "text-white" : "text-muted-foreground"}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};

export default DesktopSidebar;
