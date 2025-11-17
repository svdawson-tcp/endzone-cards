import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Calendar, Target, Rocket, Lightbulb } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AIActionSuggestions } from "@/components/AIActionSuggestions";
import { ActionEditDialog } from "@/components/ActionEditDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMentorModeGuard } from "@/hooks/useMentorModeGuard";
import { ActionCard, ActionCardHeader, ActionCardContent, ActionItem, EmptyState } from "@/components/ActionPlanning";
import { CollapsibleSection } from "@/components/ActionPlanning";


interface ActionItem {
  id: string;
  description: string;
  completed: boolean;
  category: 'monthly' | 'quarterly' | 'longterm';
  completedAt?: string;
  createdAt: string;
  archived: boolean;
  archivedAt?: string;
  aiSuggested: boolean;
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

const defaultActions: {
  monthly: ActionItem[];
  quarterly: ActionItem[];
  longterm: ActionItem[];
} = {
  monthly: [
    { id: '1', description: 'Attend 2 additional shows this month', completed: false, category: 'monthly', createdAt: new Date().toISOString(), archived: false, aiSuggested: false, completedAt: undefined, archivedAt: undefined },
    { id: '2', description: 'Increase average sale price by 10%', completed: false, category: 'monthly', createdAt: new Date().toISOString(), archived: false, aiSuggested: false, completedAt: undefined, archivedAt: undefined },
  ],
  quarterly: [
    { id: '4', description: 'Establish online presence (eBay/Facebook)', completed: false, category: 'quarterly', createdAt: new Date().toISOString(), archived: false, aiSuggested: false, completedAt: undefined, archivedAt: undefined },
  ],
  longterm: [
    { id: '7', description: 'Develop premium card specialization', completed: false, category: 'longterm', createdAt: new Date().toISOString(), archived: false, aiSuggested: false, completedAt: undefined, archivedAt: undefined },
  ],
};

const ActionPlanning = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isViewingAsMentor, preventMutation } = useMentorModeGuard();
  const [actionItems, setActionItems] = useState(defaultActions);
  const [addDialog, setAddDialog] = useState<{ open: boolean; category?: 'monthly' | 'quarterly' | 'longterm' }>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; actionId?: string; category?: 'monthly' | 'quarterly' | 'longterm' }>({ open: false });

  const { data: existingGoal, isLoading } = useQuery({
    queryKey: ['user-goals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('user_goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as UserGoal | null;
    },
  });

  useEffect(() => {
    if (existingGoal?.action_items) {
      setActionItems({
        monthly: existingGoal.action_items.monthly || defaultActions.monthly,
        quarterly: existingGoal.action_items.quarterly || defaultActions.quarterly,
        longterm: existingGoal.action_items.longterm || defaultActions.longterm,
      });
    }
  }, [existingGoal]);

  const { data: revenueData } = useQuery({
    queryKey: ['current-monthly-revenue'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase.from('transactions').select('revenue').eq('user_id', user.id).gte('transaction_date', thirtyDaysAgo.toISOString()).eq('deleted', false);
      if (error) throw error;
      return data?.reduce((sum, t) => sum + (t.revenue || 0), 0) || 0;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (items: typeof actionItems) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!existingGoal) {
        const { error } = await supabase.from('user_goals').insert({ 
          user_id: user.id, 
          action_items: items as any 
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_goals').update({ 
          action_items: items as any 
        }).eq('id', existingGoal.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      toast.success('Saved!');
    },
  });

  const handleToggle = (id: string, category: 'monthly' | 'quarterly' | 'longterm') => {
    preventMutation(() => {
      const updated = { ...actionItems };
      const action = updated[category].find(a => a.id === id);
      if (action) {
        action.completed = !action.completed;
        action.completedAt = action.completed ? new Date().toISOString() : undefined;
      }
      setActionItems(updated);
      saveMutation.mutate(updated);
    });
  };

  const handleAddAction = (description: string, category: 'monthly' | 'quarterly' | 'longterm') => {
    preventMutation(() => {
      const newAction: ActionItem = { id: Date.now().toString(), description, completed: false, category, createdAt: new Date().toISOString(), archived: false, aiSuggested: false };
      const updated = { ...actionItems, [category]: [...actionItems[category], newAction] };
      setActionItems(updated);
      saveMutation.mutate(updated);
    });
  };

  const handleAddAISuggestion = (description: string, category: 'monthly' | 'quarterly' | 'longterm') => {
    preventMutation(() => {
      const newAction: ActionItem = { id: Date.now().toString(), description, completed: false, category, createdAt: new Date().toISOString(), archived: false, aiSuggested: true };
      const updated = { ...actionItems, [category]: [...actionItems[category], newAction] };
      setActionItems(updated);
      saveMutation.mutate(updated);
    });
  };

  const getActiveActions = (category: 'monthly' | 'quarterly' | 'longterm') => actionItems[category].filter(a => !a.archived);

  const calculateCompletionRate = (category: 'monthly' | 'quarterly' | 'longterm') => {
    const actions = getActiveActions(category);
    if (actions.length === 0) return 0;
    const completed = actions.filter(a => a.completed).length;
    return Math.round((completed / actions.length) * 100);
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>;
  if (!existingGoal) return <div className="min-h-screen bg-background p-6"><div className="max-w-4xl mx-auto"><Button variant="ghost" size="sm" onClick={() => navigate('/goals/business')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><Card className="p-8 text-center bg-primary/5 mt-6"><Target className="h-12 w-12 text-primary mx-auto mb-4" /><h2 className="text-xl font-semibold mb-2 text-card-foreground">Set Your Goals First</h2><Button onClick={() => navigate('/goals/business')}>Set Up Goals</Button></Card></div></div>;

  const currentProgress = { monthly: getActiveActions('monthly'), quarterly: getActiveActions('quarterly'), longterm: getActiveActions('longterm') };

  const categoryConfig = {
    monthly: { title: "This Month", icon: Calendar },
    quarterly: { title: "Next Quarter", icon: Target },
    longterm: { title: "Long-term", icon: Rocket }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-4 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/goals/business')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-h1 text-[#041E42]">ACTION PLANNING</h1>
            <p className="text-gray-600 text-sm">Track your progress with actionable goals</p>
          </div>
        </div>
        
        <CollapsibleSection
          title="AI Action Suggestions"
          icon={Lightbulb}
          defaultOpen={false}
          storageKey="aiSuggestionsOpen"
        >
          <AIActionSuggestions 
            currentProgress={currentProgress} 
            businessMetrics={{ revenue: revenueData || 0, target: existingGoal?.target_monthly_income || 0 }} 
            onAddSuggestion={handleAddAISuggestion} 
          />
        </CollapsibleSection>
        
        {(['monthly', 'quarterly', 'longterm'] as const).map((cat) => {
          const config = categoryConfig[cat];
          const actions = currentProgress[cat];
          const completionRate = calculateCompletionRate(cat);
          
          return (
            <ActionCard key={cat} variant="default">
              <ActionCardHeader 
                onAdd={() => setAddDialog({ open: true, category: cat })}
                disabled={isViewingAsMentor}
                completionRate={completionRate}
              >
                <div className="flex items-center gap-2">
                  <config.icon className="w-5 h-5" />
                  {config.title}
                </div>
              </ActionCardHeader>
              
              <ActionCardContent>
                {actions.length === 0 ? (
                  <EmptyState>No actions yet. Click Add to create one.</EmptyState>
                ) : (
                  actions.map((action) => (
                    <ActionItem
                      key={action.id}
                      completed={action.completed}
                      onToggle={() => handleToggle(action.id, cat)}
                      onDelete={() => setDeleteDialog({ open: true, actionId: action.id, category: cat })}
                      disabled={isViewingAsMentor}
                    >
                      {action.description}
                    </ActionItem>
                  ))
                )}
              </ActionCardContent>
            </ActionCard>
          );
        })}

        <ActionEditDialog 
          open={addDialog.open} 
          onOpenChange={(open) => setAddDialog({ open })} 
          onSave={(desc) => addDialog.category && handleAddAction(desc, addDialog.category)} 
          title="Add Action" 
        />
        
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Action?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (deleteDialog.actionId && deleteDialog.category) {
                  const updated = {
                    ...actionItems,
                    [deleteDialog.category]: actionItems[deleteDialog.category].filter(a => a.id !== deleteDialog.actionId)
                  };
                  setActionItems(updated);
                  saveMutation.mutate(updated);
                  setDeleteDialog({ open: false });
                }
              }}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default ActionPlanning;
