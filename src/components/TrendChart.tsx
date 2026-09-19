import { Bar, CartesianGrid, Legend, Line, ComposedChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
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
}

const dollars = (value: unknown) => `$${Math.round(Number(value || 0)).toLocaleString("en-US")}`;

export function TrendChart({ series, grain }: TrendChartProps) {
  if (!series || series.length === 0) return null;

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
    <div className="night-game-card p-4 md:p-6 space-y-3">
      <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">Trend</h2>
      <ChartContainer config={chartConfig} className="h-[240px] w-full md:h-[320px]">
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
    </div>
  );
}
