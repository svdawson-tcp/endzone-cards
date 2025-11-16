import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  action?: ReactNode;
}

/**
 * Standardized page header component with design system compliance
 * Uses semantic tokens for consistent styling across the app
 */
export const PageHeader = ({ 
  title, 
  subtitle, 
  backTo, 
  action 
}: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-4">
      {backTo && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(backTo)}
          className="shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
      
      <div className="flex-1">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
      </div>
      
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};
