import { ReactNode } from "react";
import TopBar from "@/components/Navigation/TopBar";
import BottomTabBar from "@/components/Navigation/BottomTabBar";
import DesktopSidebar from "@/components/Navigation/DesktopSidebar";
import { MentorAccessProvider } from "@/contexts/MentorAccessContext";
import { MentorModeBanner } from "@/components/MentorModeBanner";
import { MentorAccessNotification } from "@/components/MentorAccessNotification";

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

const AuthenticatedLayout = ({ children }: AuthenticatedLayoutProps) => {
  return (
    <MentorAccessProvider>
      <div className="h-screen overflow-hidden flex flex-col">
        <TopBar />
        <MentorModeBanner />
        <div className="flex flex-1 overflow-hidden">
          <DesktopSidebar />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-8">
            {children}
          </main>
        </div>
        <BottomTabBar />
        <MentorAccessNotification />
      </div>
    </MentorAccessProvider>
  );
};

export default AuthenticatedLayout;
