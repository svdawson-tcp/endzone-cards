import { ReactNode } from "react";
import TopBar from "@/components/Navigation/TopBar";
import BottomTabBar from "@/components/Navigation/BottomTabBar";

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 pb-20 pt-28">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
};

export default AuthenticatedLayout;
