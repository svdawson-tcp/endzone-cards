import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/layout/AppLayout";
import { ReconcileDialog } from "@/components/accounts/ReconcileDialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { CASH_TYPE_LABELS } from "@/lib/moneyConstants";
import { formatBusinessDate, todayLocal, toLocalDateString } from "@/lib/dateUtils";
import { formatMoney } from "@/lib/numericUtils";
import { taxAuthorityLabel, formatTaxPeriod } from "@/hooks/useTaxTracker";
import { subDays, startOfMonth, startOfYear } from "date-fns";
import { ArrowLeft, ArrowLeftRight, CheckCircle2, AlertTriangle, Scale } from "lucide-react";

type StatementRow = {
  id: string;
  date: string;
  type: string;
  group: string;
  amount: number;
  running_balance: number;
  notes: string | null;
  tax_authority: string | null;
  tax_period: string | null;
};

type Statement = {
  account: { id: string; name: string; kind: string; target: number | null };
  from: string;
  to: string;
  opening: number;
  closing: number;
  money_in: number;
  money_out: number;
  by_kind: Record<string, number>;
  last_reconciliation: { as_of: string; difference: number; adjusted: boolean } | null;
  rows: StatementRow[];
};

const GROUP_LABELS: Record<string, string> = {
  sales: "Sales",
  purchases: "Lot purchases",
  expenses: "Expenses",
  transfers: "Transfers between accounts",
  owner_money: "Owner money",
  tax_payments: "Tax payments",
  interest: "Interest",
  adjustments: "Adjustments",
};

const RANGES = [
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
] as const;

const rangeStart = (range: string): string | null => {
  const now = new Date();
  if (range === "30d") return toLocalDateString(subDays(now, 29));
  if (range === "month") return toLocalDateString(startOfMonth(now));
  if (range === "ytd") return toLocalDateString(startOfYear(now));
  return null;
};

export default function AccountStatement() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { isViewingAsMentor } = useMentorAccess();
  const [range, setRange] = useState<string>("30d");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const from = rangeStart(range);

  const { data: statement, isLoading, error } = useQuery({
    queryKey: ["accountStatement", id, from],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_account_statement", {
        p_account_id: id,
        p_from: from ?? undefined,
        p_to: todayLocal(),
        p_limit: 300,
      });
      if (error) throw error;
      return data as unknown as Statement;
    },
  });

  const rowLabel = (row: StatementRow) => {
    if (row.type === "tax_payment") return `${taxAuthorityLabel(row.tax_authority || "")} · ${formatTaxPeriod(row.tax_period)}`;
    return CASH_TYPE_LABELS[row.type] || row.type;
  };

  const last = statement?.last_reconciliation;
  const byKind = Object.entries(statement?.by_kind || {}).filter(([, v]) => Number(v) !== 0);

  return (
    <PageContainer maxWidth="2xl">
      <Button variant="ghost" onClick={() => navigate("/accounts")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Accounts
      </Button>

      {error && <div className="night-game-card p-4 mb-4 text-sm metric-negative">{(error as Error).message}</div>}

      <div className="night-game-card p-5 md:p-6 mb-4">
        {isLoading || !statement ? (
          <Skeleton className="h-20 w-2/3 bg-muted/20" />
        ) : (
          <>
            <h1 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">{statement.account.name}</h1>
            <div className="text-3xl md:text-4xl font-bold text-foreground mt-1">{formatMoney(statement.closing)}</div>
            <div className="flex items-center gap-2 mt-2 text-sm">
              {last ? (
                Number(last.difference) === 0 || last.adjusted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 metric-positive" />
                    <span className="text-muted-foreground">Matched the bank {formatBusinessDate(last.as_of, "MMM d")}</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-muted-foreground">
                      {formatMoney(Math.abs(Number(last.difference)))} off the bank on {formatBusinessDate(last.as_of, "MMM d")}
                    </span>
                  </>
                )
              ) : (
                <span className="text-muted-foreground">Not checked against the bank yet</span>
              )}
            </div>
            {!isViewingAsMentor && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Button onClick={() => setReconcileOpen(true)} className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Scale className="mr-2 h-4 w-4" />
                  Check vs bank
                </Button>
                <Button variant="outline" onClick={() => navigate("/cash/transfer")} className="min-h-[44px]">
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Transfer
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-bold text-foreground uppercase tracking-wide">Activity</h2>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[160px] min-h-[44px]" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {statement && (
        <div className="night-game-card p-4 mb-4 text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Starting balance{statement.from ? ` (${formatBusinessDate(statement.from, "MMM d")})` : ""}</span>
            <span>{formatMoney(statement.opening)}</span>
          </div>
          {byKind.map(([kind, total]) => (
            <div key={kind} className="flex justify-between text-foreground">
              <span>{GROUP_LABELS[kind] || kind}</span>
              <span className={Number(total) >= 0 ? "metric-positive" : ""}>{formatMoney(total, { sign: true })}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold text-foreground border-t border-border/40 pt-2 mt-2">
            <span>Ending balance</span>
            <span>{formatMoney(statement.closing)}</span>
          </div>
        </div>
      )}

      <div className="night-game-card divide-y divide-border/40 mb-24">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-muted/20" />
            ))}
          </div>
        ) : statement && statement.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No activity in this range.</p>
        ) : (
          statement?.rows.map((row) => (
            <div key={row.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{rowLabel(row)}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatBusinessDate(row.date, "MMM d, yyyy")}
                  {row.notes && ` · ${row.notes}`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-semibold ${Number(row.amount) >= 0 ? "metric-positive" : "text-foreground"}`}>
                  {formatMoney(row.amount, { sign: true })}
                </div>
                <div className="text-xs text-muted-foreground">{formatMoney(row.running_balance)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {statement && (
        <ReconcileDialog
          open={reconcileOpen}
          onOpenChange={setReconcileOpen}
          accountId={statement.account.id}
          accountName={statement.account.name}
          accountKind={statement.account.kind}
        />
      )}
    </PageContainer>
  );
}
