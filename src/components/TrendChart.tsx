import { useCallback, useEffect, useState } from "react";
import { Bar, CartesianGrid, Legend, Line, ComposedChart, XAxis, YAxis } from "recharts";
import { Maximize2, X } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatBusinessDate } from "@/lib/dateUtils";

export type PeriodSeriesRow = {
  period_start: string;
  revenue: number | string;
  purchased: number | string;
  expenses: number | string;
  sale_count: number;
  rolling_revenue: number | string | null;
};

interface TrendChartProps {
  series: PeriodSeriesRow[];
  grain: "week" | "month";
  rangeLabel: string;
}

const dollars = (value: unknown) => `$${Math.round(Number(value || 0)).toLocaleString("en-US")}`;
const EXPANDED_CHART_HISTORY_KEY = "expandedTrendChart";

function TrendChartBody({
  series,
  grain,
  expanded = false,
}: Pick<TrendChartProps, "series" | "grain"> & { expanded?: boolean }) {
  const rollingLabel = grain === "month" ? "3-month average" : "4-week average";

  const chartConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--accent))" },
    purchased: { label: "Buying", color: "hsl(var(--primary))" },
    rolling_revenue: { label: rollingLabel, color: "hsl(var(--foreground))" },
  } satisfies ChartConfig;

  const labelFor = (name: unknown) =>
    String(chartConfig[name as keyof typeof chartConfig]?.label ?? name);

  const data = series.map((row) => ({
    label: formatBusinessDate(row.period_start, grain === "month" ? "MMM yy" : "MMM d"),
    revenue: Number(row.revenue || 0),
    purchased: Number(row.purchased || 0),
    rolling_revenue: Number(row.rolling_revenue || 0),
  }));

  return (
    <>
      <ChartContainer
        config={chartConfig}
        className={expanded ? "min-h-0 w-full flex-1 aspect-auto" : "h-[240px] w-full md:h-[320px]"}
      >
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.15} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={dollars} width={64} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{labelFor(name)}</span>
                    <span className="font-mono font-medium text-foreground">{dollars(value)}</span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="revenue" name="revenue" fill="var(--color-revenue)" radius={[2, 2, 0, 0]} />
          <Bar dataKey="purchased" name="purchased" fill="var(--color-purchased)" radius={[2, 2, 0, 0]} />
          <Line
            type="monotone"
            dataKey="rolling_revenue"
            name="rolling_revenue"
            stroke="var(--color-rolling_revenue)"
            strokeWidth={2}
            dot={false}
          />
          <Legend
            verticalAlign="bottom"
            height={32}
            formatter={(name) => <span className="text-xs text-muted-foreground">{labelFor(name)}</span>}
          />
        </ComposedChart>
      </ChartContainer>
      <p className="text-xs text-muted-foreground">
        {grain === "month"
          ? "The first and last bars may cover part of a month."
          : "Weeks start Monday. The first and last bars may cover part of a week."}
      </p>
    </>
  );
}

export function TrendChart({ series, grain, rangeLabel }: TrendChartProps) {
  const [expanded, setExpanded] = useState(false);

  const openExpandedChart = useCallback(() => {
    window.history.pushState(
      { ...window.history.state, [EXPANDED_CHART_HISTORY_KEY]: true },
      "",
      window.location.href,
    );
    setExpanded(true);
  }, []);

  const closeExpandedChart = useCallback(() => {
    if (window.history.state?.[EXPANDED_CHART_HISTORY_KEY]) {
      window.history.back();
    } else {
      setExpanded(false);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => setExpanded(false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    return () => {
      if (window.history.state?.[EXPANDED_CHART_HISTORY_KEY]) {
        window.history.back();
      }
    };
  }, []);

  if (!series || series.length === 0) return null;

  return (
    <div className="night-game-card p-4 md:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">Trend</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-foreground hover:bg-muted hover:text-foreground"
          aria-label="Expand chart"
          onClick={openExpandedChart}
        >
          <Maximize2 className="h-5 w-5" />
        </Button>
      </div>
      <TrendChartBody series={series} grain={grain} />

      <Dialog open={expanded} onOpenChange={(open) => !open && closeExpandedChart()}>
        <DialogContent className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none duration-0 [&>button:last-child]:hidden">
          <div className="flex min-h-[64px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-bold text-foreground uppercase tracking-wide">Trend</DialogTitle>
              <DialogDescription className="truncate text-sm text-muted-foreground">{rangeLabel}</DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close chart"
              onClick={closeExpandedChart}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-3 pt-2 sm:px-4">
            <TrendChartBody series={series} grain={grain} expanded />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
