import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { TaxTransferDialog } from "@/components/tax/TaxTransferDialog";
import { TaxPaymentDialog } from "@/components/tax/TaxPaymentDialog";
import { formatBusinessDate, toLocalDateString } from "@/lib/dateUtils";
import { addDays } from "date-fns";
import { AlertTriangle, CalendarClock, Info, Landmark, Scale, Send, Settings2 } from "lucide-react";

export type Reminder = {
  key: string;
  period: string;
  kind: "setup" | "tax_transfer" | "estimated_tax" | "reconcile" | "info";
  title: string;
  body: string;
  due: string | null;
  amount?: number;
  overdue?: boolean;
  account_id?: string;
};

const ICONS = {
  setup: Settings2,
  tax_transfer: Send,
  estimated_tax: Landmark,
  reconcile: Scale,
  info: Info,
} as const;

/** Reminders are computed by get_reminders; a card disappears on its own once the thing is done. */
export function useReminders() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  return useQuery({
    queryKey: ["reminders", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_reminders", { p_user_id: userId });
      if (error) throw error;
      return (data || []) as unknown as Reminder[];
    },
  });
}

export function ReminderCards() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isViewingAsMentor } = useMentorAccess();
  const { data: reminders = [] } = useReminders();
  const [transferAmount, setTransferAmount] = useState<number | null>(null);
  const [paymentPeriod, setPaymentPeriod] = useState<string | null>(null);

  const stateMutation = useMutation({
    mutationFn: async ({ reminder, snoozeDays }: { reminder: Reminder; snoozeDays?: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("reminders_state").upsert(
        {
          user_id: user.id,
          reminder_key: reminder.key,
          period_key: reminder.period,
          dismissed_at: snoozeDays ? null : new Date().toISOString(),
          snoozed_until: snoozeDays ? toLocalDateString(addDays(new Date(), snoozeDays)) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,reminder_key,period_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      // marking an estimated quarter done moves the tracker's next due date on
      queryClient.invalidateQueries({ queryKey: ["taxTracker"] });
    },
    onError: (error: Error) => toast({ title: "Could not update reminder", description: error.message, variant: "destructive" }),
  });

  if (reminders.length === 0) return null;

  const primaryAction = (r: Reminder) => {
    if (isViewingAsMentor) return null;
    switch (r.kind) {
      case "setup":
        return { label: "Start setup", onClick: () => navigate("/accounts/setup") };
      case "tax_transfer":
        return { label: "I sent it", onClick: () => setTransferAmount(Number(r.amount || 0)) };
      case "estimated_tax":
        return { label: "Record payment", onClick: () => setPaymentPeriod(r.period) };
      case "reconcile":
        return { label: "Check now", onClick: () => navigate(`/accounts/${r.account_id}`) };
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {reminders.map((r) => {
        const Icon = r.overdue ? AlertTriangle : ICONS[r.kind] || CalendarClock;
        const action = primaryAction(r);
        const urgent = r.kind === "tax_transfer" || r.overdue;
        return (
          <div
            key={`${r.key}:${r.period}`}
            className={`night-game-card p-4 md:p-5 ${urgent ? "border border-amber-400/60" : ""}`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`h-6 w-6 shrink-0 mt-0.5 ${urgent ? "text-amber-400" : "text-accent"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-base md:text-lg font-bold text-foreground">{r.title}</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {r.body}
                  {r.due && r.kind !== "tax_transfer" && ` Due ${formatBusinessDate(r.due, "MMM d")}.`}
                </p>
                {!isViewingAsMentor && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {action && (
                      <Button onClick={action.onClick} className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                        {action.label}
                      </Button>
                    )}
                    {r.kind === "tax_transfer" && (
                      <Button variant="outline" className="min-h-[44px]" onClick={() => navigate("/tax")}>
                        Details
                      </Button>
                    )}
                    {r.kind === "estimated_tax" && (
                      <Button
                        variant="outline"
                        className="min-h-[44px]"
                        disabled={stateMutation.isPending}
                        onClick={() => stateMutation.mutate({ reminder: r })}
                      >
                        All paid for this quarter
                      </Button>
                    )}
                    {r.kind !== "setup" && (
                      <Button
                        variant="ghost"
                        className="min-h-[44px] text-muted-foreground"
                        disabled={stateMutation.isPending}
                        onClick={() =>
                          stateMutation.mutate(r.kind === "info" ? { reminder: r } : { reminder: r, snoozeDays: r.kind === "tax_transfer" ? 1 : 3 })
                        }
                      >
                        {r.kind === "info" ? "Done" : r.kind === "tax_transfer" ? "Tomorrow" : "Remind me in 3 days"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <TaxTransferDialog
        open={transferAmount !== null}
        onOpenChange={(open) => !open && setTransferAmount(null)}
        suggestedAmount={transferAmount || 0}
      />
      <TaxPaymentDialog
        open={paymentPeriod !== null}
        onOpenChange={(open) => !open && setPaymentPeriod(null)}
        defaultPeriod={paymentPeriod}
      />
    </div>
  );
}
