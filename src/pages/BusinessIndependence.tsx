import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, DollarSign, Calendar, Target } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface UserGoal {
  id: string;
  annual_salary: number;
  tax_rate: number;
  health_insurance: number;
  target_monthly_income: number;
  independence_target_date: string | null;
  milestone_3_month: number;
  milestone_6_month: number;
  milestone_12_month: number;
}

const BusinessIndependence = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [annualSalary, setAnnualSalary] = useState(60000);
  const [taxRate, setTaxRate] = useState(30);
  const [healthInsurance, setHealthInsurance] = useState(500);
  const [independenceDate, setIndependenceDate] = useState("");
  const [milestone3Month, setMilestone3Month] = useState(0);
  const [milestone6Month, setMilestone6Month] = useState(0);
  const [milestone12Month, setMilestone12Month] = useState(0);

  // Calculate target monthly income
  const targetMonthlyIncome = 
    (annualSalary / 12) * (1 + taxRate / 100) + healthInsurance * 1.25;

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
        .in('transaction_type', ['show_card_sale', 'bulk_sale'])
        .or('deleted.is.null,deleted.eq.false');

      if (error) throw error;

      const total = data.reduce((sum, t) => sum + Number(t.revenue), 0);
      return total;
    },
  });

  const currentMonthlyRevenue = revenueData || 0;

  // Load existing goal data
  useEffect(() => {
    if (existingGoal) {
      setAnnualSalary(Number(existingGoal.annual_salary) || 60000);
      setTaxRate(Number(existingGoal.tax_rate) || 30);
      setHealthInsurance(Number(existingGoal.health_insurance) || 500);
      setIndependenceDate(existingGoal.independence_target_date || "");
      setMilestone3Month(Number(existingGoal.milestone_3_month) || 0);
      setMilestone6Month(Number(existingGoal.milestone_6_month) || 0);
      setMilestone12Month(Number(existingGoal.milestone_12_month) || 0);
    }
  }, [existingGoal]);

  // Save goals mutation
  const saveGoalsMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const goalData = {
        user_id: user.id,
        annual_salary: annualSalary,
        tax_rate: taxRate,
        health_insurance: healthInsurance,
        target_monthly_income: targetMonthlyIncome,
        independence_target_date: independenceDate || null,
        milestone_3_month: milestone3Month,
        milestone_6_month: milestone6Month,
        milestone_12_month: milestone12Month,
      };

      if (existingGoal) {
        const { error } = await supabase
          .from('user_goals')
          .update(goalData)
          .eq('id', existingGoal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_goals')
          .insert([goalData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      toast.success('Goals saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save goals');
      console.error(error);
    },
  });

  // Calculate progress
  const progressPercent = targetMonthlyIncome > 0 
    ? Math.min((currentMonthlyRevenue / targetMonthlyIncome) * 100, 100)
    : 0;

  // Calculate months to goal with different growth rates
  const calculateMonthsToGoal = (growthRate: number) => {
    if (currentMonthlyRevenue >= targetMonthlyIncome) return 0;
    if (currentMonthlyRevenue <= 0 || growthRate <= 0) return Infinity;
    
    const months = Math.log(targetMonthlyIncome / currentMonthlyRevenue) / Math.log(1 + growthRate / 100);
    return Math.ceil(months);
  };

  // Calculate cash requirements
  const operatingBuffer = (targetMonthlyIncome * 3);
  const taxReserve = (currentMonthlyRevenue * 12 * 0.25);
  const emergencyFund = (targetMonthlyIncome * 6);

  if (loadingGoals) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Path to Business Independence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan your transition from employee to full-time business owner
          </p>
        </div>
      </div>

      {/* Section 1: Income Calculator */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Income Calculator
        </h2>
        <Card className="p-6 bg-card border-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <Label htmlFor="salary">Current Annual Salary</Label>
              <Input
                id="salary"
                type="number"
                value={annualSalary}
                onChange={(e) => setAnnualSalary(Number(e.target.value))}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="tax">Estimated Tax Rate (%)</Label>
              <Input
                id="tax"
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="insurance">Monthly Health Insurance</Label>
              <Input
                id="insurance"
                type="number"
                value={healthInsurance}
                onChange={(e) => setHealthInsurance(Number(e.target.value))}
                className="mt-2"
              />
            </div>
          </div>
          <div className="bg-primary/10 p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">Target Monthly Income (with 25% buffer)</div>
            <div className="text-2xl font-bold text-primary mt-1">
              ${targetMonthlyIncome.toFixed(2)}
            </div>
          </div>
        </Card>
      </div>

      {/* Section 2: Goal Setting */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Target className="h-5 w-5" />
          Goal Setting
        </h2>
        <Card className="p-6 bg-card border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="date">Target Independence Date</Label>
              <Input
                id="date"
                type="date"
                value={independenceDate}
                onChange={(e) => setIndependenceDate(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="m3">3-Month Revenue Milestone</Label>
              <Input
                id="m3"
                type="number"
                value={milestone3Month}
                onChange={(e) => setMilestone3Month(Number(e.target.value))}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="m6">6-Month Revenue Milestone</Label>
              <Input
                id="m6"
                type="number"
                value={milestone6Month}
                onChange={(e) => setMilestone6Month(Number(e.target.value))}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="m12">12-Month Revenue Milestone</Label>
              <Input
                id="m12"
                type="number"
                value={milestone12Month}
                onChange={(e) => setMilestone12Month(Number(e.target.value))}
                className="mt-2"
              />
            </div>
          </div>
          <Button 
            onClick={() => saveGoalsMutation.mutate()}
            disabled={saveGoalsMutation.isPending}
            className="w-full md:w-auto"
          >
            {saveGoalsMutation.isPending ? 'Saving...' : 'Save Goals'}
          </Button>
        </Card>
      </div>

      {/* Section 3: Progress Dashboard */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Progress Dashboard
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground mb-2">Current Monthly Revenue</div>
            <div className="text-3xl font-bold text-white mb-4">
              ${currentMonthlyRevenue.toFixed(2)}
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="text-sm text-muted-foreground mt-2">
              {progressPercent.toFixed(1)}% of target (${targetMonthlyIncome.toFixed(2)})
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <div className="text-sm text-muted-foreground mb-4">Timeline Projections</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">At 15% monthly growth:</span>
                <span className="font-semibold">
                  {calculateMonthsToGoal(15) === Infinity 
                    ? 'N/A' 
                    : `${calculateMonthsToGoal(15)} months`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">At 25% monthly growth:</span>
                <span className="font-semibold">
                  {calculateMonthsToGoal(25) === Infinity 
                    ? 'N/A' 
                    : `${calculateMonthsToGoal(25)} months`}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Section 4: Cash Requirements */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Cash Requirements Calculator
        </h2>
        <Card className="p-6 bg-card border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Operating Buffer (3 months)</div>
              <div className="text-xl font-bold text-white mt-1">
                ${operatingBuffer.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tax Reserve (25% annual)</div>
              <div className="text-xl font-bold text-white mt-1">
                ${taxReserve.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Emergency Fund (6 months)</div>
              <div className="text-xl font-bold text-white mt-1">
                ${emergencyFund.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Cash Needed</div>
              <div className="text-xl font-bold text-primary mt-1">
                ${(operatingBuffer + taxReserve + emergencyFund).toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-4 p-4 bg-primary/10 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> Growth capital for inventory is not included. Plan to keep at least 20% of revenue available for reinvestment in inventory.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BusinessIndependence;
