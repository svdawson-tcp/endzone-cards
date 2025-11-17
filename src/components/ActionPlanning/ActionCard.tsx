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
    default: "bg-white border border-gray-200 shadow-md",
    suggestion: "bg-white border border-gray-300 shadow-lg"
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
  <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
    <div className="flex items-center gap-3">
      <h3 className="font-semibold text-lg text-gray-900">{children}</h3>
      {typeof completionRate === 'number' && (
        <span className="text-xs text-white bg-[#041E42] px-2 py-1 rounded-full font-medium">
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
        className="bg-white hover:bg-gray-50"
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
  <div className="divide-y divide-gray-200">
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
      "flex items-start gap-3 p-3 group hover:bg-gray-50 transition-colors",
      disabled && "pointer-events-none opacity-40"
    )}
  >
    <Checkbox 
      checked={completed} 
      onCheckedChange={onToggle} 
      disabled={disabled}
      className="data-[state=checked]:bg-[#041E42] data-[state=checked]:border-[#041E42] border-gray-300"
    />
    <span 
      className={cn(
        "flex-1 text-gray-900 transition-all",
        completed && "line-through text-gray-500"
      )}
    >
      {children}
    </span>
    <Button 
      variant="outline" 
      size="sm" 
      onClick={onDelete} 
      disabled={disabled}
      className="opacity-0 group-hover:opacity-100 transition-opacity !text-red-600 hover:!text-white hover:bg-red-600 border-gray-300"
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
  <div className="bg-white border border-gray-200 p-4 rounded-lg hover:border-gray-300 transition-colors">
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-900 flex-1">{children}</span>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={onAdd}
        className="shrink-0 bg-white hover:bg-gray-50"
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
  <div className="p-6 text-center text-gray-500">
    {children}
  </div>
);
