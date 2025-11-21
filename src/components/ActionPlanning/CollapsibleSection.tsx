import { ReactNode, useState, useEffect } from "react";
import { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";

interface CollapsibleSectionProps {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
  storageKey?: string;
}

export const CollapsibleSection = ({ 
  title, 
  icon: Icon, 
  defaultOpen = false,
  children,
  storageKey
}: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : defaultOpen;
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(isOpen));
    }
  }, [isOpen, storageKey]);
  
  return (
    <Card className="p-6 bg-card border-border shadow-md">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity">
          <Icon className="w-5 h-5 text-accent" />
          <h3 className="text-foreground font-medium text-lg">{title}</h3>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 ml-auto text-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 ml-auto text-foreground" />
          )}
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="mt-4">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
