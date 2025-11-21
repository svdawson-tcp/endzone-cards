import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Lightbulb, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ActionItem {
  id: string;
  description: string;
  completed: boolean;
  category: 'monthly' | 'quarterly' | 'longterm';
  completedAt?: string;
  archived?: boolean;
  aiSuggested?: boolean;
}

interface AIActionSuggestionsProps {
  currentProgress: {
    monthly: ActionItem[];
    quarterly: ActionItem[];
    longterm: ActionItem[];
  };
  businessMetrics: {
    revenue: number;
    target: number;
  };
  onAddSuggestion: (description: string, category: 'monthly' | 'quarterly' | 'longterm') => void;
}

interface SectionSuggestions {
  monthly: string[];
  quarterly: string[];
  longterm: string[];
}

export const AIActionSuggestions = ({ 
  currentProgress, 
  businessMetrics,
  onAddSuggestion
}: AIActionSuggestionsProps) => {
  const [suggestions, setSuggestions] = useState<SectionSuggestions>({
    monthly: [],
    quarterly: [],
    longterm: []
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const calculateCompletionRate = (category?: 'monthly' | 'quarterly' | 'longterm') => {
    const actions = category 
      ? currentProgress[category]
      : [...currentProgress.monthly, ...currentProgress.quarterly, ...currentProgress.longterm];
    
    const activeActions = actions.filter(a => !a.archived);
    const completed = activeActions.filter(a => a.completed).length;
    return activeActions.length > 0 ? (completed / activeActions.length) * 100 : 0;
  };

  const generateSuggestions = async () => {
    setIsGenerating(true);
    
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const revenueProgress = businessMetrics.target > 0
      ? (businessMetrics.revenue / businessMetrics.target) * 100
      : 0;
    
    const monthlyCompletion = calculateCompletionRate('monthly');
    const overallCompletion = calculateCompletionRate();

    const newSuggestions: SectionSuggestions = {
      monthly: [],
      quarterly: [],
      longterm: []
    };

    // Monthly suggestions based on completion and revenue
    if (monthlyCompletion < 50) {
      newSuggestions.monthly = [
        "Set specific show attendance days for consistency",
        "Track pricing on similar cards to optimize margins",
        "Visit 2 local card shops to research inventory trends"
      ];
    } else {
      newSuggestions.monthly = [
        "Increase average sale price by 15% through better presentation",
        "Attend 3 shows this month vs your usual 2",
        "Document your best-selling card types for future inventory"
      ];
    }

    // Quarterly suggestions
    if (revenueProgress < 40) {
      newSuggestions.quarterly = [
        "Launch eBay store with your top 20 cards",
        "Create Instagram account and post best cards weekly",
        "Build email list of interested buyers from shows",
        "Research 3 new show venues in neighboring cities"
      ];
    } else {
      newSuggestions.quarterly = [
        "Develop vintage rookie card specialization",
        "Partner with local card shop for consignment",
        "Implement inventory tracking system for better margins",
        "Expand to neighboring city shows monthly"
      ];
    }

    // Long-term suggestions
    if (overallCompletion < 33) {
      newSuggestions.longterm = [
        "Complete current action items before adding long-term goals",
        "Build foundation with monthly habits first",
        "Focus on consistency over expansion"
      ];
    } else if (revenueProgress < 60) {
      newSuggestions.longterm = [
        "Develop premium card expertise (PSA grading knowledge)",
        "Build brand recognition in local card community",
        "Create business bank account for tax tracking",
        "Research full-time income requirements and timeline"
      ];
    } else {
      newSuggestions.longterm = [
        "Plan transition timeline to full-time card business",
        "Establish LLC or business entity for protection",
        "Develop wholesale relationships with card distributors",
        "Build sustainable inventory sourcing system"
      ];
    }

    setSuggestions(newSuggestions);
    setIsGenerating(false);
    toast.success("AI suggestions generated successfully");
  };

  const handleAddSuggestion = (description: string, category: 'monthly' | 'quarterly' | 'longterm') => {
    onAddSuggestion(description, category);
    
    // Remove the added suggestion from the list
    setSuggestions(prev => ({
      ...prev,
      [category]: prev[category].filter(s => s !== description)
    }));
    
    toast.success(`Added to ${category} actions`);
  };

  const hasSuggestions = suggestions.monthly.length > 0 || 
                        suggestions.quarterly.length > 0 || 
                        suggestions.longterm.length > 0;

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/20 rounded-lg">
            <Lightbulb className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI Action Suggestions</h3>
            <p className="text-sm text-muted-foreground">
              Get personalized recommendations for each timeframe
            </p>
          </div>
        </div>
        
        <Button
          onClick={generateSuggestions}
          disabled={isGenerating}
          size="sm"
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : hasSuggestions ? (
            <>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </>
          ) : (
            <>
              <Lightbulb className="h-4 w-4" />
              Generate
            </>
          )}
        </Button>
      </div>

      {hasSuggestions && (
        <div className="space-y-6">
          {suggestions.monthly.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                Monthly Actions
                <span className="text-xs text-muted-foreground font-normal">
                  ({calculateCompletionRate('monthly').toFixed(0)}% complete)
                </span>
              </h4>
              <div className="space-y-2">
                {suggestions.monthly.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-3 bg-muted rounded-lg border border-border"
                  >
                    <div className="flex-1 text-sm text-foreground">{suggestion}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 px-2 gap-1"
                      onClick={() => handleAddSuggestion(suggestion, 'monthly')}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {suggestions.quarterly.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                Quarterly Goals
                <span className="text-xs text-muted-foreground font-normal">
                  ({calculateCompletionRate('quarterly').toFixed(0)}% complete)
                </span>
              </h4>
              <div className="space-y-2">
                {suggestions.quarterly.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-3 bg-muted rounded-lg border border-border"
                  >
                    <div className="flex-1 text-sm text-foreground">{suggestion}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 px-2 gap-1"
                      onClick={() => handleAddSuggestion(suggestion, 'quarterly')}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {suggestions.longterm.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                Long-term Vision
                <span className="text-xs text-muted-foreground font-normal">
                  ({calculateCompletionRate('longterm').toFixed(0)}% complete)
                </span>
              </h4>
              <div className="space-y-2">
                {suggestions.longterm.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-3 bg-muted rounded-lg border border-border"
                  >
                    <div className="flex-1 text-sm text-foreground">{suggestion}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 px-2 gap-1"
                      onClick={() => handleAddSuggestion(suggestion, 'longterm')}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
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
