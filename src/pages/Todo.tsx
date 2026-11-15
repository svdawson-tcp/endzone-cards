import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageContainer } from "@/components/layout/AppLayout";
import { TodoList } from "@/components/todo/TodoList";
import { TaskDialog } from "@/components/todo/TaskDialog";
import { TripDialog } from "@/components/todo/TripDialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useMoneySettings } from "@/hooks/useMoneySettings";
import { useTodo } from "@/hooks/useTodo";
import { Car, CheckCircle2, ChevronDown, ChevronUp, Plus } from "lucide-react";

const TIERS = [
  { tier: "now", label: "Now" },
  { tier: "week", label: "This week" },
  { tier: "later", label: "Later" },
] as const;

export default function Todo() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isViewingAsMentor } = useMentorAccess();
  const { data: items = [], isLoading, error } = useTodo();
  const { data: settings } = useMoneySettings();
  const [showLater, setShowLater] = useState(false);
  const [addTask, setAddTask] = useState(false);
  const [addTrip, setAddTrip] = useState(false);

  // ?dismiss=<key>: a form opened from a To Do card (e.g. "Record the fee") came back here; clear that card
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const key = searchParams.get("dismiss");
    if (!key || isViewingAsMentor || !/^[a-z_]+:[0-9a-f-]{36}$/.test(key)) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("reminders_state").upsert(
          { user_id: user.id, reminder_key: key, period_key: "once", dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: "user_id,reminder_key,period_key" },
        );
        queryClient.invalidateQueries({ queryKey: ["todo"] });
      }
      setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete("dismiss"); return n; }, { replace: true });
    })();
  }, [searchParams, setSearchParams, isViewingAsMentor, queryClient]);

  const weeklyEmail = settings?.weekly_email ?? true;
  const emailMutation = useMutation({
    mutationFn: async (on: boolean) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error: e } = await supabase.from("money_settings").upsert({ user_id: user.id, weekly_email: on }, { onConflict: "user_id" });
      if (e) throw e;
    },
    onSuccess: (_d, on) => {
      toast({ title: on ? "Sunday email is on" : "Sunday email is off" });
      queryClient.invalidateQueries({ queryKey: ["moneySettings"] });
    },
    onError: (e: Error) => toast({ title: "Could not change the email setting", description: e.message, variant: "destructive" }),
  });

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        <h1 className="page-title mb-2">TO DO</h1>
        <p className="text-muted-foreground">
          {isViewingAsMentor
            ? "Colton's list. You can add tasks for him; only he can mark them done."
            : "Things to log or do. Most items clear themselves once they're done."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={() => setAddTask(true)} className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
          <Plus className="mr-1 h-4 w-4" /> {isViewingAsMentor ? "Add a task for Colton" : "Add a task"}
        </Button>
        {!isViewingAsMentor && (
          <Button variant="outline" className="min-h-[44px]" onClick={() => setAddTrip(true)}>
            <Car className="mr-1 h-4 w-4" /> Log a drive
          </Button>
        )}
        <Button variant="outline" className="min-h-[44px]" onClick={() => navigate("/trips")}>
          Mileage log
        </Button>
      </div>

      {error && <div className="night-game-card p-4 mb-4 text-sm metric-negative">Could not load the list: {(error as Error).message}</div>}
      {isLoading && <Skeleton className="h-24 w-full bg-muted/20" />}

      {!isLoading && !error && items.length === 0 && (
        <div className="night-game-card p-6 text-center">
          <CheckCircle2 className="h-8 w-8 metric-positive mx-auto mb-2" />
          <div className="text-lg font-bold text-foreground">All caught up</div>
          <p className="text-sm text-muted-foreground">Nothing to do right now.</p>
        </div>
      )}

      {TIERS.map(({ tier, label }) => {
        const list = items.filter((i) => i.tier === tier);
        if (list.length === 0) return null;
        const collapsed = tier === "later" && !showLater;
        return (
          <section key={tier} className="mb-6">
            <button
              type="button"
              className="flex items-center gap-2 mb-3 min-h-[44px] w-full text-left"
              onClick={() => tier === "later" && setShowLater((v) => !v)}
              disabled={tier !== "later"}
            >
              <h2 className="text-xl font-bold text-foreground uppercase tracking-wide">{label}</h2>
              <span className="text-sm text-muted-foreground">({list.length})</span>
              {tier === "later" && (collapsed ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />)}
            </button>
            {!collapsed && <TodoList items={list} />}
          </section>
        );
      })}

      {!isViewingAsMentor && (
        <div className="night-game-card p-4 mt-8 flex items-center justify-between gap-4">
          <Label htmlFor="weekly-email" className="cursor-pointer text-foreground">
            Sunday email with the week's list
            <span className="block text-xs text-muted-foreground font-normal">Sent to colton@cssportscards.com about 6:30 pm. Urgent items are always emailed.</span>
          </Label>
          <Switch id="weekly-email" checked={weeklyEmail} disabled={emailMutation.isPending} onCheckedChange={(v) => emailMutation.mutate(v)} />
        </div>
      )}

      <TaskDialog open={addTask} onOpenChange={setAddTask} />
      <TripDialog open={addTrip} onOpenChange={setAddTrip} />
    </PageContainer>
  );
}
