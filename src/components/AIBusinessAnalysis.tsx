import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, AlertCircle, Target, Sparkles } from "lucide-react";

interface AIBusinessAnalysisProps {
  currentRevenue: number;
  targetIncome: number;
  progressPercent: number;
}

export const AIBusinessAnalysis = ({ 
  currentRevenue, 
  targetIncome, 
  progressPercent 
}: AIBusinessAnalysisProps) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const getBusinessStage = () => {
    if (progressPercent < 25) return "foundational";
    if (progressPercent < 50) return "scaling";
    if (progressPercent < 75) return "optimizing";
    return "transition";
  };

  const getStageGuidance = () => {
    const stage = getBusinessStage();
    const gap = targetIncome - currentRevenue;
    
    switch (stage) {
      case "foundational":
        return {
          title: "Focus on Foundational Growth",
          icon: AlertCircle,
          color: "text-amber-500",
          metrics: `You're currently at ${progressPercent.toFixed(1)}% of your target. Gap: $${gap.toFixed(2)}/month`,
          recommendations: [
            "Attend shows consistently to build customer relationships",
            "Focus on inventory turnover rather than premium cards",
            "Track which card types sell fastest at your shows",
            "Keep expenses minimal while learning the business"
          ]
        };
      case "scaling":
        return {
          title: "Scale Proven Strategies",
          icon: TrendingUp,
          color: "text-blue-500",
          metrics: `You're at ${progressPercent.toFixed(1)}% of target. Gap: $${gap.toFixed(2)}/month`,
          recommendations: [
            "Increase show frequency - you've proven it works",
            "Invest more in inventory types that sell consistently",
            "Start building repeat customer relationships",
            "Consider adding one new show venue per month"
          ]
        };
      case "optimizing":
        return {
          title: "Optimize and Expand",
          icon: Target,
          color: "text-green-500",
          metrics: `You're at ${progressPercent.toFixed(1)}% of target. Gap: $${gap.toFixed(2)}/month`,
          recommendations: [
            "Focus on profit margins - you have the volume",
            "Add premium cards to increase average sale price",
            "Build online presence for off-show sales",
            "Consider specializing in high-demand niches"
          ]
        };
      default:
        return {
          title: "Prepare for Transition",
          icon: Sparkles,
          color: "text-purple-500",
          metrics: `Excellent progress at ${progressPercent.toFixed(1)}% of target!`,
          recommendations: [
            "Document your successful business systems",
            "Build financial runway for full-time transition",
            "Start planning health insurance transition",
            "Create 3-month cash reserve before leaving job"
          ]
        };
    }
  };

  const generateAIAnalysis = async () => {
    setIsGenerating(true);
    
    // Simulate AI generation with business logic
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const guidance = getStageGuidance();
    const stage = getBusinessStage();
    
    let aiInsight = "";
    
    if (stage === "foundational") {
      aiInsight = `Based on your current trajectory, you're in the critical learning phase. Your $${currentRevenue.toFixed(2)} monthly revenue shows you're executing, but the path to $${targetIncome.toFixed(2)} requires strategic focus. The card show business rewards consistency and relationship building. Right now, your priority isn't maximizing profit on each sale—it's understanding what sells, building vendor relationships, and creating a repeatable system. Most successful card dealers say months 3-6 are when patterns become clear. Track everything: what sells, what doesn't, and which shows generate the best ROI. Your breakthrough will come from doubling down on what's working, not constantly trying new approaches.`;
    } else if (stage === "scaling") {
      const weeklyGap = (targetIncome - currentRevenue) / 4;
      aiInsight = `You've hit an important milestone—you're generating consistent revenue and understand your market. At $${currentRevenue.toFixed(2)}/month, you've proven the business model works. Now it's about volume and efficiency. The gap to your $${targetIncome.toFixed(2)} target is ${((1 - progressPercent/100) * 100).toFixed(0)}% of the journey. Focus on three growth levers: (1) increase show frequency with proven venues, (2) buy bigger lots now that you know what sells, and (3) speed up inventory turnover. Many dealers get stuck here by chasing "the big score" instead of predictable, repeatable sales. Your goal is to make $${weeklyGap.toFixed(2)} more per week through consistent execution, not home runs.`;
    } else if (stage === "optimizing") {
      aiInsight = `Strong position at $${currentRevenue.toFixed(2)}/month—you're in the top 20% of card show dealers. The final push to $${targetIncome.toFixed(2)} requires optimization, not more hustle. You need higher profit margins and premium sales. This is where specialization pays off: become known for something specific (vintage rookies, graded cards, local legends, etc.). Build an online presence for off-show sales—your reputation at shows should drive Instagram/eBay traffic. Consider the 80/20 rule: 20% of your inventory likely generates 80% of profits. Identify those high-performers and stock more. Also, you're close enough to start planning the transition seriously. Document your systems so you can scale without burning out.`;
    } else {
      const finalGap = targetIncome - currentRevenue;
      aiInsight = `Congratulations—you're at ${progressPercent.toFixed(0)}% of target and approaching a major life transition. This isn't just about hitting a revenue number; it's about sustainable independence. Before leaving your job: (1) Run at this revenue level for 3 consecutive months to prove consistency, (2) Build a 3-month cash reserve ($${(targetIncome * 3).toFixed(2)}) for the transition, (3) Research health insurance costs and add 20% buffer, (4) Document every business process so you're not reinventing daily. The final gap of $${finalGap.toFixed(2)}/month is small, but don't rush. Many dealers quit their jobs too early and the pressure destroys what they built. Take the next 60-90 days to lock in these numbers, then make the leap with confidence. You've already done the hard part.`;
    }
    
    setAnalysis(aiInsight);
    setIsGenerating(false);
  };

  const guidance = getStageGuidance();
  const StageIcon = guidance.icon;

  return (
    <div className="space-y-4">
      {/* Stage Overview */}
      <div className="flex items-start gap-3 p-4 bg-card border border-border rounded-lg">
        <StageIcon className={`w-5 h-5 mt-0.5 ${guidance.color}`} />
        <div className="flex-1">
          <h4 className="font-semibold text-card-foreground mb-1">{guidance.title}</h4>
          <p className="text-sm text-card-foreground/70">{guidance.metrics}</p>
        </div>
      </div>

      {/* Quick Recommendations */}
      <div className="space-y-2">
        <h5 className="text-sm font-medium text-card-foreground">Priority Actions:</h5>
        <ul className="space-y-1.5">
          {guidance.recommendations.map((rec, idx) => (
            <li key={idx} className="text-sm text-card-foreground/80 flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* AI Deep Analysis */}
      <div className="pt-4 border-t border-border">
        {!analysis ? (
          <Button 
            onClick={generateAIAnalysis}
            disabled={isGenerating}
            variant="outline"
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing your business...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Get AI Strategic Analysis
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Strategic Insight
            </div>
            <p className="text-sm text-card-foreground/80 leading-relaxed">
              {analysis}
            </p>
            <Button 
              onClick={() => setAnalysis(null)}
              variant="ghost"
              size="sm"
              className="w-full"
            >
              Generate New Analysis
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
