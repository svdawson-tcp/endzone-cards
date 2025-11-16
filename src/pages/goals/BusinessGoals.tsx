import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, Target, TrendingUp, DollarSign } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface UserGoal {
  id: string;
  annual_salary: number;
  tax_rate: number;
  health_insurance: number;
  target_monthly_income: number;
  milestone_3_month: number;
  milestone_6_month: number;
  milestone_12_month: number;
}

const BusinessGoals = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [milestone3Month, setMilestone3Month] = useState(0);
  const [milestone6Month, setMilestone6Month] = useState(0);
  const [milestone12Month, setMilestone12Month] = useState(0);

  // Fetch existing goals
  const { data: existingGoal, isLoading: loadingGoals } = useQuery({
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

  // Fetch current monthly revenue
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

  // Load existing data and set defaults
  useEffect(() => {
    if (existingGoal) {
      const target = existingGoal.target_monthly_income || 5000;
      setMilestone3Month(existingGoal.milestone_3_month || target * 0.25);
      setMilestone6Month(existingGoal.milestone_6_month || target * 0.5);
      setMilestone12Month(existingGoal.milestone_12_month || target * 0.75);
    }
  }, [existingGoal]);

  const targetMonthlyIncome = existingGoal?.target_monthly_income || 0;
  const currentMonthlyRevenue = revenueData || 0;

  // Calculate progress
  const progressToTarget = targetMonthlyIncome > 0 
    ? Math.min((currentMonthlyRevenue / targetMonthlyIncome) * 100, 100)
    : 0;

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (!existingGoal) {
        toast.error("Please set your personal goals first");
        navigate("/goals/personal");
        return;
      }

      const { error } = await supabase
        .from('user_goals')
        .update({
          milestone_3_month: milestone3Month,
          milestone_6_month: milestone6Month,
          milestone_12_month: milestone12Month,
        })
        .eq('id', existingGoal.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      toast.success("Business goals saved successfully!");
    },
    onError: (error) => {
      console.error('Error saving goals:', error);
      toast.error("Failed to save goals. Please try again.");
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  if (loadingGoals) {
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
          <h2 className="text-xl font-bold text-foreground mb-4">Personal Goals Required</h2>
          <p className="text-muted-foreground mb-4">
            Please set your personal goals first to calculate business targets.
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
              Business Goals
            </h1>
            <p className="text-muted-foreground">
              Revenue targets to achieve financial independence
            </p>
          </div>
        </div>

        {/* Current Progress */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Current Progress</h2>
                <p className="text-sm text-gray-600">
                  Last 30 days revenue vs. target
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600">Current Monthly Revenue</div>
                <div className="text-2xl font-bold text-foreground">
                  ${currentMonthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Target Monthly Income</div>
                <div className="text-2xl font-bold text-foreground">
                  ${targetMonthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-700">Progress to Target</span>
                <span className="font-medium text-foreground">{progressToTarget.toFixed(1)}%</span>
              </div>
              <Progress value={progressToTarget} className="h-2" />
            </div>
          </div>
        </Card>

        {/* Revenue Requirements */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Cash Requirements</h2>
                <p className="text-sm text-gray-600">
                  Understanding business vs. personal income
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-gray-700">Personal Monthly Need (after-tax)</span>
                <span className="font-medium text-foreground">
                  ${((existingGoal.annual_salary / 12) + existingGoal.health_insurance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-gray-700">Tax Burden ({existingGoal.tax_rate}%)</span>
                <span className="font-medium text-foreground">
                  ${(((existingGoal.annual_salary / 12) * (existingGoal.tax_rate / 100))).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-gray-700">Safety Buffer (25%)</span>
                <span className="font-medium text-foreground">
                  ${(existingGoal.health_insurance * 0.25).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <span className="font-semibold text-gray-900">Required Monthly Revenue</span>
                <span className="font-bold text-xl text-gray-900">
                  ${targetMonthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Milestone Targets */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Milestone Targets</h2>
                <p className="text-sm text-gray-600">
                  Progressive revenue goals to track your journey
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="milestone3Month">3-Month Target (25% of goal)</Label>
                <Input
                  id="milestone3Month"
                  type="number"
                  value={milestone3Month}
                  onChange={(e) => setMilestone3Month(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Monthly revenue target for month 3
                </p>
              </div>

              <div>
                <Label htmlFor="milestone6Month">6-Month Target (50% of goal)</Label>
                <Input
                  id="milestone6Month"
                  type="number"
                  value={milestone6Month}
                  onChange={(e) => setMilestone6Month(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Monthly revenue target for month 6
                </p>
              </div>

              <div>
                <Label htmlFor="milestone12Month">12-Month Target (75% of goal)</Label>
                <Input
                  id="milestone12Month"
                  type="number"
                  value={milestone12Month}
                  onChange={(e) => setMilestone12Month(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Monthly revenue target for month 12
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex-1"
          >
            {saveMutation.isPending ? "Saving..." : "Save Business Goals"}
          </Button>
          <Button
            onClick={() => navigate("/goals/actions")}
            variant="outline"
          >
            Next: Action Planning →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BusinessGoals;
