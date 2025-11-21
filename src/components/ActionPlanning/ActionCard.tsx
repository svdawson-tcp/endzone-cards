import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionCardProps {
  children: ReactNode;
  variant?: "default" | "suggestion";
  className?: string;
}

export const ActionCard = ({ children, variant = "default", className }: ActionCardProps) => {
  const variants = {
    default: "bg-card border-border shadow-md",
    suggestion: "bg-card border-border shadow-lg"
  };
  
  return (
    <div className={cn("rounded-lg overflow-hidden", variants[variant], className)}>
      {children}
    </div>
  );
};

interface ActionCardHeaderProps {
  children: ReactNode;
  onAdd?: () => void;
  disabled?: boolean;
  completionRate?: number;
}

export const ActionCardHeader = ({ 
  children, 
  onAdd, 
  disabled = false, 
  completionRate 
}: ActionCardHeaderProps) => (
  <div className="flex items-center justify-between p-4 border-b border-border bg-muted">
    <div className="flex items-center gap-3">
      <h3 className="font-semibold text-lg text-foreground">{children}</h3>
      {typeof completionRate === 'number' && (
        <span className="text-xs text-background bg-primary px-3 py-1 rounded-full font-medium inline-flex items-center justify-center min-w-[90px] text-center">
          {completionRate}% complete
        </span>
      )}
    </div>
    {onAdd && (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onAdd} 
        disabled={disabled}
      >
        <Plus className="w-4 h-4 mr-1" />
        Add
      </Button>
    )}
  </div>
);

interface ActionCardContentProps {
  children: ReactNode;
}

export const ActionCardContent = ({ children }: ActionCardContentProps) => (
  <div className="divide-y divide-border">
    {children}
  </div>
);

interface ActionItemProps {
  children: ReactNode;
  completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

export const ActionItem = ({ 
  children, 
  completed, 
  onToggle, 
  onDelete, 
  disabled = false 
}: ActionItemProps) => (
  <div 
    className={cn(
      "flex items-start gap-3 p-3 group hover:bg-muted/50 transition-colors",
      disabled && "pointer-events-none opacity-40"
    )}
  >
    <Checkbox 
      checked={completed} 
      onCheckedChange={onToggle} 
      disabled={disabled}
      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary border-muted-foreground/30 bg-card"
    />
    <span 
      className={cn(
        "flex-1 text-foreground transition-all",
        completed && "line-through text-muted-foreground"
      )}
    >
      {children}
    </span>
    <Button 
      variant="outline" 
      size="sm" 
      onClick={onDelete} 
      disabled={disabled}
      className="opacity-0 group-hover:opacity-100 transition-opacity !text-red-600 hover:!text-white hover:bg-red-600"
    >
      <Trash2 className="w-3 h-3" />
    </Button>
  </div>
);

interface SuggestionCardProps {
  children: ReactNode;
  onAdd: () => void;
}

export const SuggestionCard = ({ children, onAdd }: SuggestionCardProps) => (
  <div className="bg-card border border-border p-4 rounded-lg hover:border-border/80 transition-colors">
    <div className="flex items-start justify-between gap-3">
      <span className="text-foreground flex-1">{children}</span>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onAdd}
        className="shrink-0"
      >
        Add
      </Button>
    </div>
  </div>
);

interface EmptyStateProps {
  children: ReactNode;
}

export const EmptyState = ({ children }: EmptyStateProps) => (
  <div className="p-6 text-center text-muted-foreground">
    {children}
  </div>
);
