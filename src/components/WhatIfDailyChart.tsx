import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GitCompareArrows } from "lucide-react";
import type { Scenario } from "@/types";

interface Props {
  dailyWhatIf: Record<string, number | string>[];
  scenarios: Scenario[];
  currentKey: string;
  loading: boolean;
  error: string | null;
}

const COLORS = ["#ec4899", "#14b8a6", "#a78bfa", "#f87171", "#60a5fa", "#fb923c"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function WhatIfDailyChart({
  dailyWhatIf,
  scenarios,
  currentKey,
  loading,
  error,
}: Props) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-violet-400" />
          <CardTitle className="text-sm font-medium">What-If Comparison</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : dailyWhatIf.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyWhatIf} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  unit=" £"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                  }}
                  labelFormatter={(label) => formatDate(label)}
                  formatter={(value) => [`£${Number(value).toFixed(2)}`, ""]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }}
                />
                {scenarios.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={s.key === currentKey ? 2.5 : 1}
                    strokeDasharray={s.key === currentKey ? undefined : "4 3"}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}