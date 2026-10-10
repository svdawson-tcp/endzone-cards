import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/AppLayout";
import { KpiInfoPopover } from "@/components/ui/KpiInfoPopover";
import { TaxTransferDialog } from "@/components/tax/TaxTransferDialog";
import { TaxPaymentDialog } from "@/components/tax/TaxPaymentDialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useTaxTracker, taxAuthorityLabel, formatTaxPeriod, type TaxWeek } from "@/hooks/useTaxTracker";
import { formatBusinessDate, parseBusinessDate } from "@/lib/dateUtils";
import { formatMoney } from "@/lib/numericUtils";
import { kpiTooltips } from "@/data/kpiTooltips";
import { addDays, format } from "date-fns";
import { AlertTriangle, CheckCircle2, Landmark, Send } from "lucide-react";

const WEEKS_SHOWN = 8;

const weekLabel = (weekStart: string) => {
  const start = parseBusinessDate(weekStart);
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth()
    ? `${format(start, "MMM d")}–${format(end, "d")}`
    : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
};

const STATUS: Record<TaxWeek["status"], { label: string; className: string }> = {
  accruing: { label: "This week", className: "text-muted-foreground" },
  nothing_owed: { label: "No sales", className: "text-muted-foreground" },
  covered: { label: "Covered", className: "metric-positive" },
  partial: { label: "Part covered", className: "text-amber-400" },
  open: { label: "Open", className: "metric-negative" },
};

export default function Tax() {
  const { isViewingAsMentor } = useMentorAccess();
  const { data: tracker, isLoading, error } = useTaxTracker();
  const [transferOpen, setTransferOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const position = Number(tracker?.position || 0);
  const behind = position < -0.004;
  const weeks = tracker?.weeks || [];
  const visibleWeeks = showAllWeeks ? weeks : weeks.slice(0, WEEKS_SHOWN);
  const currentYear = tracker?.today?.slice(0, 4);
  const paymentsThisYear = (tracker?.payments || []).filter((p) => p.date.slice(0, 4) === currentYear);

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        <h1 className="page-title mb-2">TAX</h1>
        <p className="text-muted-foreground">
          {Math.round(Number(tracker?.tax_rate ?? 0.04) * 100)}% of every sale goes to the Tax account each week
        </p>
      </div>

      {error && (
        <div className="night-game-card p-4 mb-4 text-sm metric-negative">Could not load the tax tracker: {(error as Error).message}</div>
      )}

      {/* Position */}
      <div className="night-game-card p-5 md:p-6 relative mb-4">
        <KpiInfoPopover content={kpiTooltips.taxPosition} />
        {isLoading ? (
          <Skeleton className="h-16 w-2/3 bg-muted/20" />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              {behind ? (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              ) : (
                <CheckCircle2 className="h-5 w-5 metric-positive" />
              )}
              <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {behind ? "Behind" : "Up to date"}
              </span>
            </div>
            <div className={`text-3xl md:text-4xl font-bold ${behind ? "text-amber-400" : "metric-positive"}`}>
              {behind ? `${formatMoney(-position)} behind` : position > 0 ? `${formatMoney(position)} ahead` : "$0.00"}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Owed for weeks through{" "}
              {tracker?.current_week ? format(addDays(parseBusinessDate(tracker.current_week), -1), "MMM d") : "—"}:{" "}
              {formatMoney(tracker?.owed_due)} · set aside: {formatMoney(tracker?.deposited)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This week so far: {formatMoney(tracker?.accruing)} — due next transfer day
            </p>

            {!isViewingAsMentor && (
              <Button
                onClick={() => setTransferOpen(true)}
                className="w-full mt-4 min-h-[48px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                <Send className="mr-2 h-4 w-4" />
                {behind ? `I SENT ${formatMoney(tracker?.suggested_transfer)} TO TAX` : "RECORD A TAX TRANSFER"}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Tax account + next payment */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="night-game-card p-4">
          <Landmark className="h-6 w-6 text-accent mb-2" />
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Tax account</h3>
          {isLoading ? (
            <Skeleton className="h-7 w-2/3 bg-muted/20" />
          ) : (
            <>
              <div className="text-xl md:text-2xl font-bold text-foreground">{formatMoney(tracker?.tax_account_balance)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Paid out: {formatMoney(tracker?.paid_total)}
                {Number(tracker?.interest_total || 0) > 0 && ` · interest ${formatMoney(tracker?.interest_total)}`}
              </p>
            </>
          )}
        </div>
        <div className="night-game-card p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Next estimated payment</h3>
          {isLoading ? (
            <Skeleton className="h-7 w-2/3 bg-muted/20" />
          ) : tracker?.next_estimate_due ? (
            <>
              <div className="text-xl md:text-2xl font-bold text-foreground">
                {formatBusinessDate(tracker.next_estimate_due, "MMM d")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatTaxPeriod(tracker.next_estimate_period)} · federal and PA
              </p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">None scheduled</div>
          )}
          {!isViewingAsMentor && (
            <button onClick={() => setPaymentOpen(true)} className="text-xs text-accent underline min-h-[44px] pt-2 text-left">
              Record a payment
            </button>
          )}
        </div>
      </div>

      {/* Weeks */}
      <h2 className="text-lg font-bold text-foreground uppercase tracking-wide mb-3">By week</h2>
      <div className="night-game-card divide-y divide-border/40 mb-6">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-muted/20" />
            ))}
          </div>
        ) : (
          visibleWeeks.map((week) => {
            const status = STATUS[week.status];
            return (
              <div key={week.week_start} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{weekLabel(week.week_start)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatMoney(week.gross)} sales · {week.sale_count} {week.sale_count === 1 ? "sale" : "sales"}
                    {Number(week.deposited) > 0 && ` · sent ${formatMoney(week.deposited)}`}
                  </div>
                  {week.late_entries && (
                    <div className="text-xs text-amber-400 mt-1">Includes sales entered after the week closed</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-foreground">{formatMoney(week.owed)}</div>
                  <div className={`text-xs ${status.className}`}>{status.label}</div>
                </div>
              </div>
            );
          })
        )}
        {!isLoading && weeks.length > WEEKS_SHOWN && (
          <button
            onClick={() => setShowAllWeeks((v) => !v)}
            className="w-full p-4 text-sm text-accent underline min-h-[44px] text-center"
          >
            {showAllWeeks ? "Show recent weeks only" : `Show all ${weeks.length} weeks since ${formatBusinessDate(tracker?.tracker_start, "MMM d, yyyy")}`}
          </button>
        )}
      </div>

      {/* Payments */}
      <h2 className="text-lg font-bold text-foreground uppercase tracking-wide mb-3">Estimated payments {currentYear}</h2>
      <div className="night-game-card divide-y divide-border/40 mb-24">
        {paymentsThisYear.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No estimated payments recorded this year.</p>
        ) : (
          paymentsThisYear.map((p) => (
            <div key={p.id} className="p-4 flex justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{taxAuthorityLabel(p.authority)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatTaxPeriod(p.period)} · paid {formatBusinessDate(p.date, "MMM d")}
                  {p.notes && ` · ${p.notes}`}
                </div>
              </div>
              <div className="text-sm font-semibold text-foreground">{formatMoney(p.amount)}</div>
            </div>
          ))
        )}
      </div>

      <TaxTransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        suggestedAmount={Number(tracker?.suggested_transfer || 0)}
      />
      <TaxPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultPeriod={tracker?.next_estimate_period} />
    </PageContainer>
  );
}
