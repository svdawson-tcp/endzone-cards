import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  sidebar?: ReactNode;
  bottomNav?: ReactNode;
  className?: string;
}

export const AppLayout = ({
  children,
  header,
  sidebar,
  bottomNav,
  className
}: AppLayoutProps) => {
  return (
    <div className={cn("min-h-screen bg-background flex flex-col", className)}>
      {/* Mobile-first header */}
      {header && (
        <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
          {header}
        </header>
      )}
      
      <div className="flex flex-1">
        {/* Desktop sidebar - hidden on mobile */}
        {sidebar && (
          <aside className="hidden lg:block w-64 border-r border-border bg-surface">
            {sidebar}
          </aside>
        )}
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      
      {/* Mobile bottom navigation */}
      {bottomNav && (
        <nav className="lg:hidden sticky bottom-0 z-50 w-full border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
          {bottomNav}
        </nav>
      )}
    </div>
  );
};

/* Page container for consistent spacing */
export const PageContainer = ({ 
  children, 
  className,
  maxWidth = "7xl"
}: { 
  children: ReactNode; 
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
}) => {
  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md", 
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl"
  };

  return (
    <div className={cn(
      "container mx-auto px-4 py-6 lg:px-6 lg:py-8",
      maxWidthClasses[maxWidth],
      className
    )}>
      {children}
    </div>
  );
};

/* Section headers with consistent styling */
export const SectionHeader = ({
  title,
  description,
  action,
  className
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between lg:gap-4 mb-6", className)}>
    <div className="space-y-1">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      {description && (
        <p className="text-muted-foreground">{description}</p>
      )}
    </div>
    {action && (
      <div className="flex-shrink-0">
        {action}
      </div>
    )}
  </div>
);
