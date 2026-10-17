import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useTaxTracker } from "@/hooks/useTaxTracker";
import { formatBusinessDate, toLocalDateString } from "@/lib/dateUtils";
import { formatMoney } from "@/lib/numericUtils";
import { addDays, startOfWeek, subWeeks } from "date-fns";
import { Phone } from "lucide-react";

type Account = { id: string; name: string; kind: string; balance: number };
type StatementSummary = {
  account: { id: string; name: string; kind: string };
  opening: number;
  closing: number;
  last_reconciliation: { as_of: string; difference: number; adjusted: boolean } | null;
  rows: { date: string; type: string; amount: number }[];
};

/**
 * Mentor-only summary for the weekly call. Balances and numbers first, so a bad week
 * is cheap to report (Sept 13 meeting). Every figure comes from a database function.
 */
export function WeeklyCallCard() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  const { data: tax } = useTaxTracker();

  const today = new Date();
  const lastWeekStart = subWeeks(startOfWeek(today, { weekStartsOn: 1 }), 1);
  const lastWeekEnd = addDays(lastWeekStart, 6);
  const lwStart = toLocalDateString(lastWeekStart);
  const lwEnd = toLocalDateString(lastWeekEnd);
  const sevenDaysAgo = toLocalDateString(addDays(today, -6));

  const { data, isLoading } = useQuery({
    queryKey: ["weeklyCall", viewingUserId, lwStart],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data: m, error } = await supabase.rpc("get_dashboard_metrics", { p_user_id: userId, p_start: lwStart, p_end: lwEnd });
      if (error) throw error;
      const metrics = m as unknown as {
        inventory_purchased: number;
        lots_purchased: number;
        gross_sales: number;
        sale_count: number;
        owed_to_owner: number;
        accounts: Account[];
      };
      const statements = await Promise.all(
        (metrics.accounts || []).map(async (a) => {
          const { data: st, error: stErr } = await supabase.rpc("get_account_statement", {
            p_account_id: a.id,
            p_from: sevenDaysAgo,
            p_limit: 50,
          });
          if (stErr) throw stErr;
          return st as unknown as StatementSummary;
        }),
      );
      return { metrics, statements };
    },
  });

  const reserve = data?.statements.find((s) => s.account.kind === "reserve");
  const taxStatement = data?.statements.find((s) => s.account.kind === "tax");
  const lastTaxDeposit = taxStatement?.rows.find((r) => r.type === "transfer" && Number(r.amount) > 0);
  const position = Number(tax?.position || 0);

  const line = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="text-sm font-semibold text-foreground">{value}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );

  return (
    <div className="night-game-card p-4 md:p-5">
      <div className="flex items-center gap-2 mb-2">
        <Phone className="h-5 w-5 text-accent" />
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Weekly call</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          Last week: {formatBusinessDate(lwStart, "MMM d")} – {formatBusinessDate(lwEnd, "MMM d")}
        </span>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-40 w-full bg-muted/20" />
      ) : (
        <div className="divide-y divide-border/40">
          {line(
            "Reserve",
            formatMoney(reserve?.closing),
            reserve ? `${formatMoney(Number(reserve.closing) - Number(reserve.opening), { sign: true })} in the last 7 days` : "No Reserve account",
          )}
          {line("Buying", formatMoney(data.metrics.inventory_purchased), `${Number(data.metrics.lots_purchased || 0)} lots`)}
          {line("Gross sales", formatMoney(data.metrics.gross_sales), `${Number(data.metrics.sale_count || 0)} sales`)}
          {line(
            "Tax",
            position < -0.004 ? `${formatMoney(-position)} behind` : position > 0 ? `${formatMoney(position)} ahead` : "Up to date",
            lastTaxDeposit ? `last transfer ${formatBusinessDate(lastTaxDeposit.date, "MMM d")}` : "no transfer in the last 7 days",
          )}
          {line(
            "Bank checks",
            `${data.statements.filter((s) => s.last_reconciliation).length} of ${data.statements.length} accounts checked`,
            data.statements
              .map((s) =>
                s.last_reconciliation
                  ? `${s.account.name} ${formatBusinessDate(s.last_reconciliation.as_of, "MMM d")}${
                      Number(s.last_reconciliation.difference) !== 0 && !s.last_reconciliation.adjusted ? " (off)" : ""
                    }`
                  : `${s.account.name} not yet`,
              )
              .join(" · "),
          )}
          {Number(data.metrics.owed_to_owner || 0) > 0 && line("Owed to Colton", formatMoney(data.metrics.owed_to_owner), "paid personally")}
        </div>
      )}
    </div>
  );
}
