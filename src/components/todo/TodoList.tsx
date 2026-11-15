import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { TaxTransferDialog } from "@/components/tax/TaxTransferDialog";
import { TaxPaymentDialog } from "@/components/tax/TaxPaymentDialog";
import { TripDialog } from "@/components/todo/TripDialog";
import { TaskDialog, type TaskRow } from "@/components/todo/TaskDialog";
import { useInvalidateTodo } from "@/hooks/useTodo";
import { formatBusinessDate, toLocalDateString } from "@/lib/dateUtils";
import type { TodoItem, TripPrefill } from "@/lib/todo";
import { addDays } from "date-fns";
import {
  AlertTriangle, CalendarClock, Car, CheckCircle2, ClipboardCheck, HandCoins, Inbox, Info, Landmark, ListTodo, Package,
  Scale, Send, Settings2, Star, Store, Target,
} from "lucide-react";

const ICONS = {
  setup: Settings2,
  tax_transfer: Send,
  estimated_tax: Landmark,
  reconcile: Scale,
  info: Info,
  checkup: ClipboardCheck,
  trip: Car,
  task: ListTodo,
  sell_lead: Inbox,
  offer: HandCoins,
  order: Package,
  show_fee: Store,
  show_prep: Store,
  show_close: Store,
  old_shows: Store,
  headliner: Star,
  wanted: Target,
} as const;

/** The signed-in person (Colton, or Scott in mentor view) — needed to know which tasks Scott may edit. */
function useMyUserId() {
  return useQuery({
    queryKey: ["myUserId"],
    staleTime: Infinity,
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
}

/**
 * Cards for To Do items. Every item comes from get_todo and disappears by itself once the thing is done;
 * dismiss and snooze are stored in reminders_state (owner only). Shared by the dashboard preview and /todo.
 */
export function TodoList({ items }: { items: TodoItem[] }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateTodo();
  const { isViewingAsMentor } = useMentorAccess();
  const { data: myId } = useMyUserId();
  const [transferAmount, setTransferAmount] = useState<number | null>(null);
  const [paymentPeriod, setPaymentPeriod] = useState<string | null>(null);
  const [tripPrefill, setTripPrefill] = useState<TripPrefill | null>(null);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);

  const stateMutation = useMutation({
    mutationFn: async ({ item, snoozeDays }: { item: TodoItem; snoozeDays?: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      // a combined bank-check card stands for one reminder per account
      const keys = item.keys?.length ? item.keys : [item.key];
      const { error } = await supabase.from("reminders_state").upsert(
        keys.map((key) => ({
          user_id: user.id,
          reminder_key: key,
          period_key: item.period,
          dismissed_at: snoozeDays ? null : new Date().toISOString(),
          snoozed_until: snoozeDays ? toLocalDateString(addDays(new Date(), snoozeDays)) : null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "user_id,reminder_key,period_key" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast({ title: "Could not update the list", description: error.message, variant: "destructive" }),
  });

  const doneMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("tasks").update({ done_at: new Date().toISOString() }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Done" });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Could not mark it done", description: error.message, variant: "destructive" }),
  });

  const closeShowsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("shows").update({ status: "completed" }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast({ title: `Closed ${ids.length} show${ids.length === 1 ? "" : "s"}` });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Could not close the shows", description: error.message, variant: "destructive" }),
  });

  if (items.length === 0) return null;

  const primaryAction = (r: TodoItem) => {
    if (isViewingAsMentor) return null;
    switch (r.kind) {
      case "setup":
        return { label: "Start setup", onClick: () => navigate("/accounts/setup") };
      case "tax_transfer":
        return { label: "I sent it", onClick: () => setTransferAmount(Number(r.amount || 0)) };
      case "estimated_tax":
        return { label: "Record payment", onClick: () => setPaymentPeriod(r.period) };
      case "reconcile":
        return { label: "Check now", onClick: () => navigate(r.account_id ? `/accounts/${r.account_id}` : "/accounts") };
      case "checkup":
        return { label: "Start checkup", onClick: () => navigate(`/checkup/${r.period}`) };
      case "trip":
        return { label: "Log the drive", onClick: () => setTripPrefill({ ...r.trip, prompt_key: r.key }) };
      case "task":
        return { label: "Done", onClick: () => r.task_id && doneMutation.mutate(r.task_id) };
      case "sell_lead":
        return { label: "Reply", onClick: () => navigate(r.link || "/sellers") };
      case "offer":
        return { label: "Answer", onClick: () => navigate(r.link || "/offers") };
      case "order":
        return { label: "Open orders", onClick: () => navigate(r.link || "/web-orders") };
      case "show_fee": {
        // the expense form comes back to To Do and clears this card
        const back = `/todo?dismiss=${encodeURIComponent(r.key)}`;
        const date = r.show_date && r.show_date <= toLocalDateString(new Date()) ? `&date=${r.show_date}` : "";
        return {
          label: "Record the fee",
          onClick: () => navigate(`/expenses/new?category=${encodeURIComponent("Table / Booth Fees")}${date}&returnTo=${encodeURIComponent(back)}`),
        };
      }
      case "show_prep":
        return r.needs_show
          ? { label: "Add the show", onClick: () => navigate("/shows/new") }
          : { label: "Ready", onClick: () => stateMutation.mutate({ item: r }) };
      case "show_close":
        return { label: "Open the show", onClick: () => navigate(r.link || "/shows") };
      case "old_shows":
        return {
          label: `Close all ${r.show_ids?.length ?? ""}`.trim(),
          onClick: () => r.show_ids?.length && closeShowsMutation.mutate(r.show_ids),
        };
      case "headliner":
        return { label: "Pick one", onClick: () => navigate(r.link || "/website?tab=headliner") };
      case "wanted":
        return { label: "Open the list", onClick: () => navigate(r.link || "/website?tab=wanted") };
      default:
        return null;
    }
  };

  const secondaryAction = (r: TodoItem) => {
    if (isViewingAsMentor) return null;
    switch (r.kind) {
      case "setup":
      case "task":
      case "sell_lead":
      case "offer":
      case "order":
      case "show_close":
        return null;
      case "show_fee":
        return { label: "Already paid", onClick: () => stateMutation.mutate({ item: r }) };
      case "show_prep":
        return r.needs_show ? { label: "Ready", onClick: () => stateMutation.mutate({ item: r }) } : null;
      case "old_shows":
        return { label: "Not now", onClick: () => stateMutation.mutate({ item: r, snoozeDays: 7 }) };
      case "headliner":
        return { label: "Keep it another week", onClick: () => stateMutation.mutate({ item: r, snoozeDays: 7 }) };
      case "wanted":
        return { label: "Still good", onClick: () => stateMutation.mutate({ item: r, snoozeDays: 7 }) };
      case "info":
        return { label: "Done", onClick: () => stateMutation.mutate({ item: r }) };
      case "tax_transfer":
      case "checkup":
        return { label: "Tomorrow", onClick: () => stateMutation.mutate({ item: r, snoozeDays: 1 }) };
      case "trip":
        return { label: "No drive", onClick: () => stateMutation.mutate({ item: r }) };
      default:
        return { label: "Remind me in 3 days", onClick: () => stateMutation.mutate({ item: r, snoozeDays: 3 }) };
    }
  };

  const canEditTask = (r: TodoItem) =>
    r.kind === "task" && (!isViewingAsMentor || (!!myId && r.created_by === myId));

  const openTaskEditor = async (r: TodoItem) => {
    if (!r.task_id) return;
    const { data, error } = await supabase.from("tasks").select("id, title, notes, due_date, urgent").eq("id", r.task_id).maybeSingle();
    if (error || !data) {
      toast({ title: "Could not open the task", description: error?.message, variant: "destructive" });
      return;
    }
    setEditTask(data as TaskRow);
  };

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const Icon = r.overdue ? AlertTriangle : ICONS[r.kind] || CalendarClock;
        const action = primaryAction(r);
        const second = secondaryAction(r);
        const urgent = r.kind === "tax_transfer" || r.overdue || r.urgent;
        return (
          <div key={`${r.key}:${r.period}`} className={`night-game-card p-4 md:p-5 ${urgent ? "border border-amber-400/60" : ""}`}>
            <div className="flex items-start gap-3">
              <Icon className={`h-6 w-6 shrink-0 mt-0.5 ${urgent ? "text-amber-400" : "text-accent"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-base md:text-lg font-bold text-foreground">{r.title}</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {r.body}
                  {r.due && !["tax_transfer", "trip", "sell_lead", "offer", "order", "show_close", "show_fee", "show_prep"].includes(r.kind) &&
                    ` ${r.overdue ? "Was due" : "Due"} ${formatBusinessDate(r.due, "MMM d")}.`}
                  {r.added_by_mentor && " Added by Scott."}
                </p>
                {(action || second || canEditTask(r) || r.kind === "tax_transfer") && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {action && (
                      <Button
                        onClick={action.onClick}
                        disabled={doneMutation.isPending || closeShowsMutation.isPending}
                        className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                      >
                        {r.kind === "task" && <CheckCircle2 className="mr-1 h-4 w-4" />}
                        {action.label}
                      </Button>
                    )}
                    {r.kind === "tax_transfer" && !isViewingAsMentor && (
                      <Button variant="outline" className="min-h-[44px]" onClick={() => navigate("/tax")}>
                        Details
                      </Button>
                    )}
                    {r.kind === "estimated_tax" && !isViewingAsMentor && (
                      <Button variant="outline" className="min-h-[44px]" disabled={stateMutation.isPending}
                        onClick={() => stateMutation.mutate({ item: r })}>
                        All paid for this quarter
                      </Button>
                    )}
                    {canEditTask(r) && (
                      <Button variant="outline" className="min-h-[44px]" onClick={() => openTaskEditor(r)}>
                        Edit
                      </Button>
                    )}
                    {second && (
                      <Button variant="ghost" className="min-h-[44px] text-muted-foreground" disabled={stateMutation.isPending}
                        onClick={second.onClick}>
                        {second.label}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <TaxTransferDialog open={transferAmount !== null} onOpenChange={(o) => !o && setTransferAmount(null)}
        suggestedAmount={transferAmount || 0} />
      <TaxPaymentDialog open={paymentPeriod !== null} onOpenChange={(o) => !o && setPaymentPeriod(null)}
        defaultPeriod={paymentPeriod} />
      <TripDialog open={tripPrefill !== null} onOpenChange={(o) => !o && setTripPrefill(null)} prefill={tripPrefill} />
      <TaskDialog open={editTask !== null} onOpenChange={(o) => !o && setEditTask(null)} task={editTask} />
    </div>
  );
}
