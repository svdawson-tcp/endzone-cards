import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Plus, Edit2, Trash2, Calendar, Target, Rocket } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AIActionSuggestions } from "@/components/AIActionSuggestions";
import { ActionEditDialog } from "@/components/ActionEditDialog";
import { ArchiveManager } from "@/components/ArchiveManager";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMentorModeGuard } from "@/hooks/useMentorModeGuard";

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

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>;
  if (!existingGoal) return <div className="min-h-screen bg-background p-6"><div className="max-w-4xl mx-auto"><Button variant="ghost" size="sm" onClick={() => navigate('/goals/business')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><Card className="p-8 text-center bg-primary/5 mt-6"><Target className="h-12 w-12 text-primary mx-auto mb-4" /><h2 className="text-xl font-semibold mb-2 text-card-foreground">Set Your Goals First</h2><Button onClick={() => navigate('/goals/business')}>Set Up Goals</Button></Card></div></div>;

  const currentProgress = { monthly: getActiveActions('monthly'), quarterly: getActiveActions('quarterly'), longterm: getActiveActions('longterm') };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/goals/business')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
        <div><h1 className="text-3xl font-bold text-foreground">Action Planning</h1></div>
        
        <AIActionSuggestions currentProgress={currentProgress} businessMetrics={{ revenue: revenueData || 0, target: existingGoal?.target_monthly_income || 0 }} onAddSuggestion={handleAddAISuggestion} />
        
        {(['monthly', 'quarterly', 'longterm'] as const).map((cat) => (
          <Card key={cat} className="p-6 bg-primary/5">
            <SectionHeading title={cat === 'monthly' ? "This Month" : cat === 'quarterly' ? "Next Quarter" : "Long-term"} icon={cat === 'monthly' ? Calendar : cat === 'quarterly' ? Target : Rocket} action={<Button size="sm" variant="outline" onClick={() => setAddDialog({ open: true, category: cat })} disabled={isViewingAsMentor}><Plus className="h-4 w-4" />Add</Button>} />
            <div className="space-y-3 mt-4">
              {currentProgress[cat].map((action) => (
                <div key={action.id} className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border group">
                  <Checkbox checked={action.completed} onCheckedChange={() => handleToggle(action.id, cat)} disabled={isViewingAsMentor} />
                  <div className="flex-1"><p className={action.completed ? 'line-through text-muted-foreground' : 'text-card-foreground'}>{action.description}</p></div>
                  <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => setDeleteDialog({ open: true, actionId: action.id, category: cat })} disabled={isViewingAsMentor}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          </Card>
        ))}

        <ActionEditDialog open={addDialog.open} onOpenChange={(open) => setAddDialog({ open })} onSave={(desc) => addDialog.category && handleAddAction(desc, addDialog.category)} title="Add Action" />
        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open })}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteDialog.actionId && deleteDialog.category) { const updated = { ...actionItems, [deleteDialog.category]: actionItems[deleteDialog.category].filter(a => a.id !== deleteDialog.actionId) }; setActionItems(updated); saveMutation.mutate(updated); setDeleteDialog({ open: false }); }}}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>
    </div>
  );
};

export default ActionPlanning;
