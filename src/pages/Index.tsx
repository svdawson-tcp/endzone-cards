import logo from "@/assets/endzone-logo-main.png";

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <img src={logo} alt="EndZone Logo" className="mx-auto w-full max-w-2xl" />
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Sports Card Inventory & Business Management System
        </p>
      </div>
    </div>
  );
};

export default Index;
