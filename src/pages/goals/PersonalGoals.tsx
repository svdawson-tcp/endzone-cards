import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Heart, Target, DollarSign, Calendar } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface UserGoal {
  id: string;
  annual_salary: number;
  tax_rate: number;
  health_insurance: number;
  target_monthly_income: number;
  independence_target_date: string | null;
}

const PersonalGoals = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Form state
  const [annualSalary, setAnnualSalary] = useState(60000);
  const [taxRate, setTaxRate] = useState(30);
  const [healthInsurance, setHealthInsurance] = useState(500);
  const [independenceDate, setIndependenceDate] = useState("");
  const [lifeVision, setLifeVision] = useState("");
  const [motivation, setMotivation] = useState("");
  const [familyGoals, setFamilyGoals] = useState("");

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

  // Load existing data
  useEffect(() => {
    if (existingGoal) {
      setAnnualSalary(existingGoal.annual_salary || 60000);
      setTaxRate(existingGoal.tax_rate || 30);
      setHealthInsurance(existingGoal.health_insurance || 500);
      setIndependenceDate(existingGoal.independence_target_date || "");
    }
  }, [existingGoal]);

  // Calculate target monthly income
  const targetMonthlyIncome = 
    (annualSalary / 12) * (1 + taxRate / 100) + healthInsurance * 1.25;

  // Save mutation
  const saveMutation = useMutation({
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
      toast.success("Personal goals saved successfully!");
    },
    onError: (error) => {
      console.error('Error saving goals:', error);
      toast.error("Failed to save goals. Please try again.");
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
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
              Personal Goals
            </h1>
            <p className="text-muted-foreground">
              Define your vision for financial independence
            </p>
          </div>
        </div>

        {/* Life Vision */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold card-foreground">Life Vision</h2>
                <p className="text-sm text-card-foreground/70">
                  What does your ideal life look like?
                </p>
              </div>
            </div>
            <Textarea
              placeholder="Describe your vision for life after achieving financial independence... (e.g., travel with family, work on your own schedule, pursue hobbies)"
              value={lifeVision}
              onChange={(e) => setLifeVision(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </Card>

        {/* Motivation */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold card-foreground">Motivation</h2>
                <p className="text-sm text-card-foreground/70">
                  Why is independence important to you?
                </p>
              </div>
            </div>
            <Textarea
              placeholder="What drives you to achieve financial independence? (e.g., freedom from corporate life, control over your time, building something of your own)"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </Card>

        {/* Family Goals */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold card-foreground">Family Goals</h2>
                <p className="text-sm text-card-foreground/70">
                  How will this impact your family?
                </p>
              </div>
            </div>
            <Textarea
              placeholder="Family considerations and goals... (e.g., more time with kids, financial security, supporting spouse's career)"
              value={familyGoals}
              onChange={(e) => setFamilyGoals(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </Card>

        {/* Financial Requirements */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold card-foreground">Financial Requirements</h2>
                <p className="text-sm text-card-foreground/70">
                  What income do you need to replace?
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="annualSalary">Current Annual Salary</Label>
                <Input
                  id="annualSalary"
                  type="number"
                  value={annualSalary}
                  onChange={(e) => setAnnualSalary(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-card-foreground/60 mt-1">
                  Your current total annual compensation
                </p>
              </div>

              <div>
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-card-foreground/60 mt-1">
                  Estimated combined tax rate (federal + state + self-employment)
                </p>
              </div>

              <div>
                <Label htmlFor="healthInsurance">Monthly Health Insurance</Label>
                <Input
                  id="healthInsurance"
                  type="number"
                  value={healthInsurance}
                  onChange={(e) => setHealthInsurance(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-xs text-card-foreground/60 mt-1">
                  Estimated monthly cost for private health insurance
                </p>
              </div>

              {/* Calculated Target */}
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-card-foreground/70">Target Personal Income</div>
                    <div className="text-2xl font-bold card-foreground">
                      ${targetMonthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
                <p className="text-xs text-card-foreground/60 mt-2">
                  Monthly personal income needed to replace your job (after taxes and insurance)
                </p>
              </Card>
            </div>
          </div>
        </Card>

        {/* Timeline */}
        <Card className="p-6 bg-card border-border">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold card-foreground">Timeline</h2>
                <p className="text-sm text-card-foreground/70">
                  When do you want to achieve independence?
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="independenceDate">Target Independence Date</Label>
              <Input
                id="independenceDate"
                type="date"
                value={independenceDate}
                onChange={(e) => setIndependenceDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-card-foreground/60 mt-1">
                Your target date to leave your current job
              </p>
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
            {saveMutation.isPending ? "Saving..." : "Save Personal Goals"}
          </Button>
          <Button
            onClick={() => navigate("/goals/business")}
            variant="outline"
          >
            Next: Business Goals →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PersonalGoals;
