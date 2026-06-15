import type { ChartDisplayType, ChartSummaryPoint } from "../types";
import { AreaChart, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Area, Bar } from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "./ui/chart";

type TrendChartProps = {
  points: ChartSummaryPoint[];
  displayType: ChartDisplayType;
  formatCurrency: (amount: string) => string;
};

export function TrendChart({
  points,
  displayType,
  formatCurrency
}: TrendChartProps) {
  const chartData = points.map((point) => ({
    ...point,
    shortLabel: point.shortLabel,
    formattedTotal: formatCurrency(point.total.toFixed(1))
  }));

  const chartConfig = {
    total: {
      label: "Total Spend ",
      color: "var(--primary)"
    }
  } satisfies ChartConfig;

  const minWidth = Math.max(640, points.length * 56)

  return (
    <div className="w-full space-y-4">
      <ChartContainer config={chartConfig} className="h-[300px] w-full" minWidth={minWidth}>
        {displayType === "area" ? (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="shortLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              width={60}
              tickFormatter={(value) => formatCurrency(value.toFixed(2))}
            />
            <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(38,122,30,0.28)" }} />
            <Area
              dataKey="total"
              type="monotone"
              fill="url(#fillTotal)"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{
                fill: "var(--primary)",
                r: 4,
                strokeWidth: 2,
                stroke: "var(--background)"
              }}
              activeDot={{
                r: 6,
                fill: "var(--primary)",
                stroke: "var(--background)",
                strokeWidth: 2
              }}
            />
          </AreaChart>
        ) : (
          <BarChart data={chartData}>
            <defs>
              <linearGradient id="fillBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--gold)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="shortLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              width={60}
              tickFormatter={(value) => formatCurrency(value.toFixed(1))}
            />
            <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(38,122,30,0.28)" }} />
            <Bar
              dataKey="total"
              fill="url(#fillBar)"
              radius={[8, 8, 0, 0]}
              label={{
                position: "top",
                fill: "var(--foreground)",
                fontSize: 12,
                formatter: (value: any) => formatCurrency((value as number).toFixed(1))
              }}
            />
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}
