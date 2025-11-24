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
        <DesktopSidebar />
        <main className="flex-1 overflow-y-auto pb-20 pt-20 md:pt-28 md:ml-60 md:pb-8">
          {children}
        </main>
        <BottomTabBar />
        <MentorAccessNotification />
      </div>
    </MentorAccessProvider>
  );
};

export default AuthenticatedLayout;
