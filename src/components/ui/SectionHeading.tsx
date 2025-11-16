import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface SectionHeadingProps {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

/**
 * Standardized section heading component with design system compliance
 * Provides consistent styling for section headers across pages
 */
export const SectionHeading = ({ 
  title, 
  icon: Icon, 
  action,
  className = ""
}: SectionHeadingProps) => {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-foreground" />}
        {title}
      </h2>
      
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};

/**
 * Subsection variant for nested headings
 */
export const SubsectionHeading = ({ 
  title, 
  icon: Icon,
  action,
  className = ""
}: SectionHeadingProps) => {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h3 className="text-lg font-semibold text-card-foreground flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-card-foreground" />}
        {title}
      </h3>
      
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
};
