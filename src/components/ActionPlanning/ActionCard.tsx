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
    default: "bg-gradient-to-br from-[hsl(var(--navy-base))] to-[hsl(var(--navy-base))]/90 border border-[hsl(var(--star-gold))]/20 text-white shadow-lg",
    suggestion: "bg-card border border-[hsl(var(--star-gold))]/30 text-card-foreground shadow-xl backdrop-blur-sm"
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
  <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--star-gold))]/30 bg-gradient-to-r from-[hsl(var(--navy-base))] to-[hsl(var(--navy-base))]/95">
    <div className="flex items-center gap-3">
      <h3 className="font-semibold text-lg text-white">{children}</h3>
      {typeof completionRate === 'number' && (
        <span className="text-xs text-[hsl(var(--star-gold))] bg-[hsl(var(--star-gold))]/10 px-2 py-1 rounded-full border border-[hsl(var(--star-gold))]/20">
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
        className="bg-[hsl(var(--star-gold))] text-[hsl(var(--navy-base))] hover:bg-[hsl(var(--star-gold))]/90 border-[hsl(var(--star-gold))] font-medium"
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
  <div className="divide-y divide-[hsl(var(--star-gold))]/10">
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
      "flex items-start gap-3 p-3 group hover:bg-white/5 transition-colors",
      disabled && "pointer-events-none opacity-40"
    )}
  >
    <Checkbox 
      checked={completed} 
      onCheckedChange={onToggle} 
      disabled={disabled}
      className="data-[state=checked]:bg-[hsl(var(--star-gold))] data-[state=checked]:border-[hsl(var(--star-gold))] border-white/30"
    />
    <span 
      className={cn(
        "flex-1 text-white transition-all",
        completed && "line-through text-white/60"
      )}
    >
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
  <div className="bg-card border border-[hsl(var(--star-gold))]/20 p-4 rounded-lg hover:border-[hsl(var(--star-gold))]/40 transition-colors">
    <div className="flex items-start justify-between gap-3">
      <span className="text-card-foreground flex-1">{children}</span>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onAdd}
        className="shrink-0 bg-[hsl(var(--star-gold))]/10 hover:bg-[hsl(var(--star-gold))]/20 text-[hsl(var(--navy-base))] border-[hsl(var(--star-gold))]/30 font-medium"
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
  <div className="p-6 text-center text-white/60">
    {children}
  </div>
);
