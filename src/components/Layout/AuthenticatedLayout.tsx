import { ReactNode } from "react";
import TopBar from "@/components/Navigation/TopBar";
import BottomTabBar from "@/components/Navigation/BottomTabBar";
import DesktopSidebar from "@/components/Navigation/DesktopSidebar";

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <DesktopSidebar />
      <main className="flex-1 pb-20 pt-16 md:ml-60 md:pb-8">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
};

export default AuthenticatedLayout;
