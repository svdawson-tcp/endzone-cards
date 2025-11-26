import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface KpiInfoPopoverProps {
  content: string;
}

export function KpiInfoPopover({ content }: KpiInfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          className="absolute top-2 right-2 p-3 rounded-full hover:bg-muted/50 transition-colors z-20"
          aria-label="Information about this metric"
        >
          <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-300 transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs text-sm p-3 bg-popover border-border text-popover-foreground">
        {content}
      </PopoverContent>
    </Popover>
  );
}
