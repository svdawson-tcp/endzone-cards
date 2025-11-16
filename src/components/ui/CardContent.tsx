import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface CardContentProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
}

/**
 * Standardized card content wrapper with design system compliance
 * Provides consistent styling for card titles, descriptions, and content
 */
export const CardContent = ({ 
  title, 
  description, 
  icon: Icon,
  children,
  className = ""
}: CardContentProps) => {
  return (
    <Card className={`p-6 bg-card border-border shadow-md ${className}`}>
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="bg-primary/10 p-3 rounded-lg shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        )}
        
        <div className="flex-1">
          <h2 className="text-xl font-bold text-card-foreground mb-2">
            {title}
          </h2>
          
          {description && (
            <p className="text-card-foreground/80 leading-relaxed mb-4">
              {description}
            </p>
          )}
          
          {children}
        </div>
      </div>
    </Card>
  );
};

/**
 * Compact variant for smaller cards in grids
 */
export const CardContentCompact = ({ 
  title, 
  description, 
  icon: Icon,
  children,
  className = ""
}: CardContentProps) => {
  return (
    <Card className={`p-5 bg-card border-border shadow-md hover:shadow-lg transition-all ${className}`}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="bg-primary/10 p-2 rounded-lg shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
        
        <div className="flex-1">
          <h3 className="text-lg font-bold text-card-foreground mb-2">
            {title}
          </h3>
          
          {description && (
            <p className="text-sm text-card-foreground/80 mb-3">
              {description}
            </p>
          )}
          
          {children}
        </div>
      </div>
    </Card>
  );
};
