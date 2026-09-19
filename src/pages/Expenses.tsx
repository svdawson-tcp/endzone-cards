import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBusinessDate } from "@/lib/dateUtils";
import { usePeriod } from "@/hooks/usePeriod";
import { PeriodPicker } from "@/components/PeriodPicker";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { EditExpenseDialog } from "@/components/expenses/EditExpenseDialog";
import { DeleteExpenseDialog } from "@/components/expenses/DeleteExpenseDialog";

const PAGE_SIZE = 50;

type ExpenseSummary = {
  total: number;
  count: number;
  paid_personally_total: number;
  by_category: { category: string; total: number; count: number }[];
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  notes: string | null;
  show_id: string | null;
  paid_personally: boolean | null;
  account_id: string | null;
  shows?: { name: string } | null;
  cash_accounts?: { name: string } | null;
};

const money = (value: unknown) => `$${Number(value || 0).toFixed(2)}`;

export default function Expenses() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const periodState = usePeriod();
  const { start, end, customInvalid, rangeLabel } = periodState;
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();

  const [pages, setPages] = useState(1);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["expenseSummary", viewingUserId, start, end],
    enabled: !customInvalid,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_expense_summary", {
        p_user_id: userId,
        p_start: start,
        p_end: end,
      });
      if (error) throw error;
      return data as unknown as ExpenseSummary;
    },
  });

  const { data: expenses, isLoading: loadingList } = useQuery({
    queryKey: ["expensesList", viewingUserId, start, end, pages],
    enabled: !customInvalid,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      let query = supabase
        .from("expenses")
        .select("*, shows (name), cash_accounts (name)")
        .eq("user_id", userId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(0, pages * PAGE_SIZE - 1);

      if (start) query = query.gte("expense_date", start);
      if (end) query = query.lte("expense_date", end);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ExpenseRow[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenseSummary"] });
    queryClient.invalidateQueries({ queryKey: ["expensesList"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
  };

  const categories = summary?.by_category || [];
  const largestCategory = categories.reduce((max, c) => Math.max(max, Number(c.total || 0)), 0);
  const paidPersonallyTotal = Number(summary?.paid_personally_total || 0);
  const hasMore = (expenses?.length || 0) >= pages * PAGE_SIZE;

  return (
    <div className="container mx-auto px-4 py-6 space-y-8 max-w-7xl pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground uppercase tracking-wide">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">{rangeLabel}</p>
        </div>
        <div className="w-full md:w-auto space-y-3">
          <PeriodPicker state={periodState} />
          {!isViewingAsMentor && (
            <Button
              onClick={() => navigate("/expenses/new")}
              className="w-full md:w-[220px] min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold uppercase"
            >
              <Plus className="mr-2 h-4 w-4" />
              Record Expense
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <div className="night-game-card p-4 md:p-6">
          <Receipt className="h-7 w-7 text-accent mb-3" />
          <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Total</h3>
          {loadingSummary ? (
            <Skeleton className="h-9 w-2/3 bg-muted/20" />
          ) : (
            <div className="text-2xl md:text-3xl font-bold text-foreground">{money(summary?.total)}</div>
          )}
        </div>
        <div className="night-game-card p-4 md:p-6">
          <Receipt className="h-7 w-7 text-accent mb-3" />
          <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Entries</h3>
          {loadingSummary ? (
            <Skeleton className="h-9 w-1/2 bg-muted/20" />
          ) : (
            <div className="text-2xl md:text-3xl font-bold text-foreground">{Number(summary?.count || 0)}</div>
          )}
        </div>
        {paidPersonallyTotal > 0 && (
          <div className="night-game-card p-4 md:p-6">
            <Receipt className="h-7 w-7 text-accent mb-3" />
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Paid personally
            </h3>
            <div className="text-2xl md:text-3xl font-bold text-foreground">{money(paidPersonallyTotal)}</div>
          </div>
        )}
      </div>

      {/* By category */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">By Category</h2>
        <div className="night-game-card p-4 md:p-6">
          {loadingSummary ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-muted/20" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-sm text-foreground">{cat.category}</span>
                    <span className="text-sm text-foreground">
                      {money(cat.total)}{" "}
                      <span className="text-xs text-muted-foreground">({Number(cat.count)})</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted/30">
                    <div
                      className="h-1.5 rounded-full bg-accent"
                      style={{
                        width: `${largestCategory > 0 ? (Number(cat.total) / largestCategory) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expense list */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">All Expenses</h2>
        <div className="night-game-card p-4 md:p-6">
          {loadingList ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full bg-muted/20" />
              ))}
            </div>
          ) : !expenses || expenses.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center gap-3 py-3">
                  <button
                    onClick={() => !isViewingAsMentor && setEditing(expense)}
                    disabled={isViewingAsMentor}
                    className="flex-1 text-left min-h-[44px]"
                  >
                    <div className="flex justify-between items-baseline gap-3">
                      <span className="text-sm font-medium text-foreground">{expense.category}</span>
                      <span className="text-sm font-semibold text-foreground">{money(expense.amount)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatBusinessDate(expense.expense_date, "MMM d, yyyy")}
                      </span>
                      {expense.shows?.name && (
                        <span className="text-xs text-muted-foreground">· {expense.shows.name}</span>
                      )}
                      {expense.paid_personally ? (
                        <Badge variant="outline" className="text-xs">Paid personally</Badge>
                      ) : (
                        expense.cash_accounts?.name && (
                          <span className="text-xs text-muted-foreground">· {expense.cash_accounts.name}</span>
                        )
                      )}
                    </div>
                  </button>
                  {!isViewingAsMentor && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px]"
                        aria-label="Edit expense"
                        onClick={() => setEditing(expense)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] text-destructive"
                        aria-label="Delete expense"
                        onClick={() => setDeleting(expense)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {hasMore && (
                <div className="pt-4 text-center">
                  <Button variant="outline" className="min-h-[44px]" onClick={() => setPages((p) => p + 1)}>
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <EditExpenseDialog
        expense={editing}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />
      <DeleteExpenseDialog
        expense={deleting}
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={refresh}
      />
    </div>
  );
}
