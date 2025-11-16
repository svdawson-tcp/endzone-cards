import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, CheckSquare, Calendar, Target, Rocket, Lightbulb } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AIActionSuggestions } from "@/components/AIActionSuggestions";

interface ActionItem {
  id: string;
  description: string;
  completed: boolean;
  category: 'monthly' | 'quarterly' | 'longterm';
}

interface UserGoal {
  id: string;
  action_items: {
    monthly?: ActionItem[];
    quarterly?: ActionItem[];
    longterm?: ActionItem[];
  };
  target_monthly_income?: number;
}

const defaultActions = {
  monthly: [
    { id: '1', description: 'Attend 2 additional shows this month', completed: false, category: 'monthly' as const },
    { id: '2', description: 'Increase average sale price by 10%', completed: false, category: 'monthly' as const },
    { id: '3', description: 'Research new card venues in my area', completed: false, category: 'monthly' as const },
  ],
  quarterly: [
    { id: '4', description: 'Establish online presence (eBay/Facebook)', completed: false, category: 'quarterly' as const },
    { id: '5', description: 'Build customer email list', completed: false, category: 'quarterly' as const },
    { id: '6', description: 'Expand to neighboring cities', completed: false, category: 'quarterly' as const },
  ],
  longterm: [
    { id: '7', description: 'Develop premium card specialization', completed: false, category: 'longterm' as const },
    { id: '8', description: 'Create business bank account', completed: false, category: 'longterm' as const },
    { id: '9', description: 'Build brand recognition', completed: false, category: 'longterm' as const },
  ],
};

const ActionPlanning = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [actionItems, setActionItems] = useState<{
    monthly: ActionItem[];
    quarterly: ActionItem[];
    longterm: ActionItem[];
  }>(defaultActions);

  // Fetch existing goals
  const { data: existingGoal, isLoading } = useQuery({
    queryKey: ['user-goals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as UserGoal | null;
    },
  });

  // Load existing action items
  useEffect(() => {
    if (existingGoal?.action_items) {
      const items = existingGoal.action_items;
      setActionItems({
        monthly: items.monthly || defaultActions.monthly,
        quarterly: items.quarterly || defaultActions.quarterly,
        longterm: items.longterm || defaultActions.longterm,
      });
    }
  }, [existingGoal]);

  // Fetch current monthly revenue for AI suggestions
  const { data: revenueData } = useQuery({
    queryKey: ['current-monthly-revenue'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('transactions')
        .select('revenue')
        .eq('user_id', user.id)
        .gte('transaction_date', thirtyDaysAgo.toISOString())
        .eq('deleted', false);

      if (error) throw error;

      const totalRevenue = data?.reduce((sum, t) => sum + (t.revenue || 0), 0) || 0;
      return totalRevenue;
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (!existingGoal) {
        toast.error("Please set your goals first");
        navigate("/goals/personal");
        return;
      }

      const { error } = await supabase
        .from('user_goals')
        .update({
          action_items: actionItems as any,
        })
        .eq('id', existingGoal.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      toast.success("Action plan saved successfully!");
    },
    onError: (error) => {
      console.error('Error saving action plan:', error);
      toast.error("Failed to save action plan. Please try again.");
    },
  });

  const handleToggle = (category: 'monthly' | 'quarterly' | 'longterm', actionId: string) => {
    setActionItems(prev => ({
      ...prev,
      [category]: prev[category].map(item =>
        item.id === actionId ? { ...item, completed: !item.completed } : item
      ),
    }));
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const calculateProgress = (items: ActionItem[]) => {
    if (items.length === 0) return 0;
    const completed = items.filter(item => item.completed).length;
    return Math.round((completed / items.length) * 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!existingGoal) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="p-6 max-w-md">
          <h2 className="text-xl font-bold text-foreground mb-4">Goals Required</h2>
          <p className="text-muted-foreground mb-4">
            Please set your personal and business goals first.
          </p>
          <Button onClick={() => navigate("/goals/personal")}>
            Set Personal Goals
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Action Planning
            </h1>
            <p className="text-muted-foreground">
              Track your progress with actionable goals
            </p>
          </div>
        </div>

        {/* AI Action Suggestions */}
        <Card className="bg-card border-border shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lightbulb className="w-6 h-6 text-primary" />
              <h3 className="text-lg font-semibold card-foreground">AI Action Suggestions</h3>
            </div>
            
            <AIActionSuggestions 
              currentProgress={actionItems}
              businessMetrics={{
                revenue: revenueData || 0,
                target: existingGoal?.target_monthly_income || 0
              }}
            />
          </div>
        </Card>

        {/* This Month's Focus */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold card-foreground">This Month's Focus</h2>
                  <p className="text-sm text-card-foreground/70">
                    {calculateProgress(actionItems.monthly)}% complete
                  </p>
                </div>
              </div>
              <CheckSquare className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              {actionItems.monthly.map(action => (
                <div key={action.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={action.completed}
                    onCheckedChange={() => handleToggle('monthly', action.id)}
                    className="mt-0.5"
                  />
                  <span className={`text-sm ${action.completed ? 'line-through text-muted-foreground' : 'card-foreground'}`}>
                    {action.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Next Quarter's Goals */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 p-2 rounded-lg">
                  <Target className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold card-foreground">Next Quarter's Goals</h2>
                  <p className="text-sm text-card-foreground/70">
                    {calculateProgress(actionItems.quarterly)}% complete
                  </p>
                </div>
              </div>
              <Target className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              {actionItems.quarterly.map(action => (
                <div key={action.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={action.completed}
                    onCheckedChange={() => handleToggle('quarterly', action.id)}
                    className="mt-0.5"
                  />
                  <span className={`text-sm ${action.completed ? 'line-through text-muted-foreground' : 'card-foreground'}`}>
                    {action.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Long-Term Initiatives */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-accent/10 p-2 rounded-lg">
                  <Rocket className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold card-foreground">Long-Term Initiatives</h2>
                  <p className="text-sm text-card-foreground/70">
                    {calculateProgress(actionItems.longterm)}% complete
                  </p>
                </div>
              </div>
              <Rocket className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-3">
              {actionItems.longterm.map(action => (
                <div key={action.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={action.completed}
                    onCheckedChange={() => handleToggle('longterm', action.id)}
                    className="mt-0.5"
                  />
                  <span className={`text-sm ${action.completed ? 'line-through text-muted-foreground' : 'card-foreground'}`}>
                    {action.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending ? "Saving..." : "Save Action Plan"}
        </Button>
      </div>
    </div>
  );
};

export default ActionPlanning;
