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
    default: "bg-background/50 border border-border rounded-lg",
    suggestion: "bg-primary/5 border border-border rounded-lg"
  };
  
  return (
    <div className={cn(variants[variant], className)}>
      {children}
    </div>
  );
};

interface ActionCardHeaderProps {
  children: ReactNode;
  onAdd?: () => void;
  disabled?: boolean;
}

export const ActionCardHeader = ({ children, onAdd, disabled }: ActionCardHeaderProps) => (
  <div className="flex items-center justify-between p-4 border-b border-border">
    <h3 className="text-foreground font-semibold text-lg">{children}</h3>
    {onAdd && (
      <Button variant="outline" size="sm" onClick={onAdd} disabled={disabled}>
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
  <div className="divide-y divide-border/50">
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

export const ActionItem = ({ children, completed, onToggle, onDelete, disabled }: ActionItemProps) => (
  <div className="flex items-start gap-3 p-3 group hover:bg-accent/50 transition-colors">
    <Checkbox checked={completed} onCheckedChange={onToggle} disabled={disabled} />
    <span className={cn(
      "flex-1 text-foreground",
      completed && "line-through text-muted-foreground"
    )}>
      {children}
    </span>
    <Button 
      variant="outline" 
      size="sm" 
      onClick={onDelete} 
      disabled={disabled}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:border-destructive"
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
  <div className="bg-card border border-border p-4 rounded-lg hover:border-primary/50 transition-colors">
    <div className="flex items-start justify-between gap-3">
      <span className="text-card-foreground flex-1">{children}</span>
      <Button variant="outline" size="sm" onClick={onAdd} className="shrink-0">
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
