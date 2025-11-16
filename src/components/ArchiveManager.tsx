import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Archive } from "lucide-react";
import { format } from "date-fns";

interface ActionItem {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: string;
  archived: boolean;
  archivedAt?: string;
  category: 'monthly' | 'quarterly' | 'longterm';
}

interface ArchiveManagerProps {
  archivedActions: ActionItem[];
}

export const ArchiveManager = ({ archivedActions }: ArchiveManagerProps) => {
  const [showArchived, setShowArchived] = useState(false);

  if (archivedActions.length === 0) {
    return null;
  }

  const groupedArchived = {
    monthly: archivedActions.filter(a => a.category === 'monthly'),
    quarterly: archivedActions.filter(a => a.category === 'quarterly'),
    longterm: archivedActions.filter(a => a.category === 'longterm'),
  };

  return (
    <Card className="p-4 bg-primary/5 border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">
            Archived Actions ({archivedActions.length})
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Show
            </>
          )}
        </Button>
      </div>

      {showArchived && (
        <div className="space-y-4 mt-4">
          {groupedArchived.monthly.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Monthly</h4>
              <div className="space-y-2">
                {groupedArchived.monthly.map((action) => (
                  <div key={action.id} className="text-sm text-muted-foreground pl-4 border-l-2 border-border">
                    <div className="line-through">{action.description}</div>
                    {action.completedAt && (
                      <div className="text-xs mt-1">
                        Completed: {format(new Date(action.completedAt), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedArchived.quarterly.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Quarterly</h4>
              <div className="space-y-2">
                {groupedArchived.quarterly.map((action) => (
                  <div key={action.id} className="text-sm text-muted-foreground pl-4 border-l-2 border-border">
                    <div className="line-through">{action.description}</div>
                    {action.completedAt && (
                      <div className="text-xs mt-1">
                        Completed: {format(new Date(action.completedAt), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupedArchived.longterm.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Long-term</h4>
              <div className="space-y-2">
                {groupedArchived.longterm.map((action) => (
                  <div key={action.id} className="text-sm text-muted-foreground pl-4 border-l-2 border-border">
                    <div className="line-through">{action.description}</div>
                    {action.completedAt && (
                      <div className="text-xs mt-1">
                        Completed: {format(new Date(action.completedAt), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
