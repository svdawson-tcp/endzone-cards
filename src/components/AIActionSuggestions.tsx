import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lightbulb, CheckCircle2, TrendingUp, AlertCircle } from "lucide-react";

interface ActionItem {
  id: string;
  description: string;
  completed: boolean;
  category: 'monthly' | 'quarterly' | 'longterm';
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
}

export const AIActionSuggestions = ({ 
  currentProgress, 
  businessMetrics 
}: AIActionSuggestionsProps) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const calculateCompletionRate = () => {
    const allActions = [
      ...currentProgress.monthly,
      ...currentProgress.quarterly,
      ...currentProgress.longterm
    ];
    const completed = allActions.filter(a => a.completed).length;
    return allActions.length > 0 ? (completed / allActions.length) * 100 : 0;
  };

  const getActionPriority = () => {
    const completion = calculateCompletionRate();
    const revenueProgress = businessMetrics.target > 0 
      ? (businessMetrics.revenue / businessMetrics.target) * 100 
      : 0;

    if (completion < 33) {
      return {
        stage: "focus",
        title: "Focus on Current Goals First",
        icon: AlertCircle,
        color: "text-amber-500",
        message: `You have ${(100 - completion).toFixed(0)}% of actions remaining. Complete these before adding new initiatives.`
      };
    } else if (completion < 67) {
      return {
        stage: "strategic",
        title: "Add Strategic Expansion Actions",
        icon: TrendingUp,
        color: "text-blue-500",
        message: `Strong progress at ${completion.toFixed(0)}% completion. Ready to layer in growth initiatives.`
      };
    } else {
      return {
        stage: "advance",
        title: "Advance to Next Growth Phase",
        icon: CheckCircle2,
        color: "text-green-500",
        message: `Excellent execution at ${completion.toFixed(0)}% completion. Time to level up your strategy.`
      };
    }
  };

  const generateSuggestions = async () => {
    setIsGenerating(true);
    
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const priority = getActionPriority();
    const revenueProgress = (businessMetrics.revenue / businessMetrics.target) * 100;
    const monthlyCompleted = currentProgress.monthly.filter(a => a.completed).length;
    const quarterlyCompleted = currentProgress.quarterly.filter(a => a.completed).length;
    
    let newSuggestions: string[] = [];

    if (priority.stage === "focus") {
      // Low completion - reinforce current goals
      newSuggestions = [
        "Complete remaining monthly actions before adding new ones—consistency beats novelty",
        "Set specific days/times for show attendance to build routine",
        "Track completion in this app daily to maintain momentum",
        `Focus on the ${currentProgress.monthly.length - monthlyCompleted} unfinished monthly items—they compound faster than you think`
      ];
    } else if (priority.stage === "strategic") {
      // Medium completion - strategic expansion
      if (revenueProgress < 40) {
        newSuggestions = [
          "Add online sales channel (eBay or Facebook Marketplace) for 24/7 revenue",
          "Create simple social media presence—post your best cards after each show",
          "Build customer list with email/phone for repeat business notifications",
          "Research 2 new show venues for next quarter to expand market reach"
        ];
      } else {
        newSuggestions = [
          "Develop specialty niche (vintage, rookies, local legends) to command premium prices",
          "Add grading service knowledge—PSA/BGS graded cards sell for 3-5x raw value",
          "Create vendor partnerships for better lot sourcing",
          "Plan show circuit schedule 3 months ahead for inventory planning"
        ];
      }
    } else {
      // High completion - advanced strategy
      if (revenueProgress >= 75) {
        newSuggestions = [
          "Document business systems and processes for sustainable scaling",
          "Build 3-month financial runway ($" + (businessMetrics.target * 3).toFixed(0) + ") before job transition",
          "Research self-employment tax obligations and quarterly payment schedule",
          "Create 12-month business plan for full-time card dealing",
          "Connect with established full-time dealers for mentorship and advice"
        ];
      } else {
        newSuggestions = [
          "Add premium card focus to increase average sale value by 25%",
          "Build referral program—existing customers are your best sales force",
          "Create pricing spreadsheet to track ROI by card type and show",
          "Expand to adjacent markets (autographs, memorabilia, sealed product)",
          "Set up business entity (LLC) for liability protection and tax benefits"
        ];
      }
    }

    setSuggestions(newSuggestions);
    setIsGenerating(false);
  };

  const priority = getActionPriority();
  const PriorityIcon = priority.icon;

  return (
    <div className="space-y-4">
      {/* Priority Status */}
      <div className="flex items-start gap-3 p-4 bg-card border border-border rounded-lg">
        <PriorityIcon className={`w-5 h-5 mt-0.5 ${priority.color}`} />
        <div className="flex-1">
          <h4 className="font-semibold text-card-foreground mb-1">{priority.title}</h4>
          <p className="text-sm text-card-foreground/70">{priority.message}</p>
        </div>
      </div>

      {/* AI Suggestions */}
      <div>
        {suggestions.length === 0 ? (
          <Button 
            onClick={generateSuggestions}
            disabled={isGenerating}
            variant="outline"
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing your progress...
              </>
            ) : (
              <>
                <Lightbulb className="w-4 h-4 mr-2" />
                Get Smart Action Suggestions
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                <Lightbulb className="w-4 h-4 text-primary" />
                Recommended Next Actions
              </div>
              <Button 
                onClick={() => setSuggestions([])}
                variant="ghost"
                size="sm"
              >
                Refresh
              </Button>
            </div>
            
            <ul className="space-y-2.5">
              {suggestions.map((suggestion, idx) => (
                <li key={idx} className="flex items-start gap-2.5 p-3 bg-card border border-border rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-card-foreground/80">{suggestion}</span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-card-foreground/60 pt-2">
              💡 Tip: Add the most relevant suggestions to your action plan above
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
