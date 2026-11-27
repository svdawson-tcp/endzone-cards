// Dashboard → Market (0039): Colton's monthly sales next to the sports card market on eBay.
// All numbers (sales, market figure, both indexes, base months) come from get_market_comparison; this only formats them.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { KpiInfoPopover } from "@/components/ui/KpiInfoPopover";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { kpiTooltips } from "@/data/kpiTooltips";
import { formatBusinessDate } from "@/lib/dateUtils";
import { formatMoney } from "@/lib/numericUtils";

type MarketRow = {
  month: string;
  sales: number | null;
  sale_count: number;
  market_usd: number | null;
  source_url: string | null;
  is_partial: boolean;
  is_base: boolean;
  sales_index: number | null;
  market_index: number | null;
};

const chartConfig = {
  sales_index: { label: "Your sales", color: "hsl(var(--accent))" },
  market_index: { label: "Market (eBay sports)", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

const monthLabel = (m: string, pattern = "MMM yy") => formatBusinessDate(m, pattern);
const indexText = (v: number | null) => (v == null ? "—" : Math.round(Number(v)).toString());
/** Index 100 = the base. 142 → "+42%", 85 → "−15%". */
const vsBase = (v: number | null) => {
  if (v == null) return "—";
  const pct = Math.round(Number(v) - 100);
  return pct > 0 ? `+${pct}%` : pct < 0 ? `−${Math.abs(pct)}%` : "0%";
};
const marketMillions = (v: number | null) => (v == null ? "Not published yet" : `$${Math.round(Number(v) / 1e6)}M`);

export function MarketSection() {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["marketComparison", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_market_comparison", { p_user_id: userId, p_months: 18 });
      if (error) throw error;
      return (data ?? []) as unknown as MarketRow[];
    },
  });

  const rows = data ?? [];
  const base = rows.filter((r) => r.is_base);
  const baseLabel =
    base.length > 0
      ? base.length === 1
        ? monthLabel(base[0].month, "MMM yyyy")
        : monthLabel(base[0].month, "yyyy") === monthLabel(base[base.length - 1].month, "yyyy")
          ? `${monthLabel(base[0].month, "MMM")}–${monthLabel(base[base.length - 1].month, "MMM yyyy")}`
          : `${monthLabel(base[0].month, "MMM yyyy")}–${monthLabel(base[base.length - 1].month, "MMM yyyy")}`
      : "";
  // Latest finished month that has both figures: the headline comparison
  const latest = [...rows].reverse().find((r) => !r.is_partial && r.sales_index != null && r.market_index != null);
  const current = rows.find((r) => r.is_partial);
  const gaps = rows.filter((r) => !r.is_partial && r.sales != null && r.market_usd == null);
  // The chart leaves out this month (partial) and months before the first sale.
  const chartData = rows
    .filter((r) => !r.is_partial && (r.sales_index != null || r.market_index != null))
    .map((r) => ({
      label: monthLabel(r.month),
      sales_index: r.sales_index == null ? null : Number(r.sales_index),
      market_index: r.market_index == null ? null : Number(r.market_index),
    }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold uppercase tracking-wide text-foreground">You vs the Market</h2>
        <p className="mt-1 text-xs text-muted-foreground">Last 18 months · not affected by the date range</p>
      </div>
      <div className="night-game-card relative space-y-4 p-4 md:p-6">
        <KpiInfoPopover content={kpiTooltips.marketComparison} />
        {isLoading ? (
          <Skeleton className="h-[240px] w-full bg-muted/20" />
        ) : !latest ? (
          <p className="pr-8 text-sm text-muted-foreground">
            Not enough history yet. This fills in once there are three full months with both your sales and a market figure.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 pr-8">
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground md:text-sm">
                  Your sales, {monthLabel(latest.month, "MMM")}
                </h3>
                <div className="text-2xl font-bold text-foreground md:text-3xl">{vsBase(latest.sales_index)}</div>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground md:text-sm">
                  Market, {monthLabel(latest.month, "MMM")}
                </h3>
                <div className="text-2xl font-bold text-foreground md:text-3xl">{vsBase(latest.market_index)}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground md:text-sm">
              Both compared with their own {baseLabel} average. The latest month with a market figure is{" "}
              {monthLabel(latest.month, "MMMM yyyy")}.
            </p>

            <ChartContainer config={chartConfig} className="h-[240px] w-full md:h-[320px]">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={40} />
                <ReferenceLine y={100} strokeOpacity={0.35} strokeDasharray="4 4" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex w-full justify-between gap-3">
                          <span className="text-muted-foreground">
                            {String(chartConfig[name as keyof typeof chartConfig]?.label ?? name)}
                          </span>
                          <span className="font-mono font-medium text-foreground">{indexText(value as number)}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Line type="monotone" dataKey="sales_index" name="sales_index" stroke="var(--color-sales_index)"
                  strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="market_index" name="market_index" stroke="var(--color-market_index)"
                  strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
                <Legend verticalAlign="bottom" height={32}
                  formatter={(name) => (
                    <span className="text-xs text-muted-foreground">
                      {String(chartConfig[name as keyof typeof chartConfig]?.label ?? name)}
                    </span>
                  )} />
              </LineChart>
            </ChartContainer>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>100 = {baseLabel} average. Above 100 means bigger than then.</p>
              {current && current.sales != null && (
                <p>{monthLabel(current.month, "MMMM")} so far: {formatMoney(current.sales)} ({current.sale_count} sales). Not on the chart until the month ends.</p>
              )}
              {gaps.length > 0 && (
                <p>
                  Market figure not published yet for {gaps.map((g) => monthLabel(g.month, "MMM yyyy")).join(", ")}. Added when it comes out.
                </p>
              )}
            </div>

            <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={() => setOpen(true)}>
              <List className="mr-2 h-4 w-4" /> See every month
            </Button>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase tracking-wide text-foreground">You vs the Market</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Index 100 = {baseLabel} average. Market = single sports cards sold on eBay that month (GemRate).
            </DialogDescription>
          </DialogHeader>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Month</th>
                <th className="py-2 pr-2 text-right font-medium">Your sales</th>
                <th className="py-2 pr-2 text-right font-medium">You</th>
                <th className="py-2 pr-2 text-right font-medium">Market</th>
                <th className="py-2 text-right font-medium">Mkt</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.month} className="border-t border-border/40 text-foreground">
                  <td className="whitespace-nowrap py-2 pr-2">
                    {monthLabel(r.month)}
                    {r.is_partial && <span className="text-xs text-muted-foreground"> (so far)</span>}
                    {r.is_base && <span className="text-xs text-muted-foreground"> (base)</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 text-right">{r.sales == null ? "—" : formatMoney(r.sales)}</td>
                  <td className="py-2 pr-2 text-right">{r.is_partial ? "—" : indexText(r.sales_index)}</td>
                  <td className="whitespace-nowrap py-2 pr-2 text-right">
                    {r.market_usd != null && r.source_url ? (
                      <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {marketMillions(r.market_usd)}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right">{indexText(r.market_index)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">Tap a market figure to see where it came from.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
