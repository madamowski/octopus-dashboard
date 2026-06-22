import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Flame } from "lucide-react";
import type { DailyConsumption } from "@/types";

interface Props {
  title: string;
  data: DailyConsumption[];
  loading: boolean;
  error: string | null;
  fuel: "electricity" | "gas";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function MeterCard({ title, data, loading, error, fuel }: Props) {
  const color = fuel === "electricity" ? "#ec4899" : "#14b8a6";
  const Icon = fuel === "electricity" ? Zap : Flame;

  const total = data.reduce((sum, d) => sum + d.consumption_kwh, 0);
  const avg = data.length ? total / data.length : 0;
  const maxEntry = data.reduce((m, d) => (d.consumption_kwh > m.consumption_kwh ? d : m), data[0] ?? { date: "—", consumption_kwh: 0 });
  const max = maxEntry.consumption_kwh;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color }} />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold tabular-nums" style={{ color }}>
                  {total.toFixed(3)} <span className="text-xs font-normal text-muted-foreground">kWh</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg daily</p>
                <p className="text-lg font-bold tabular-nums" style={{ color }}>
                  {avg.toFixed(3)} <span className="text-xs font-normal text-muted-foreground">kWh</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Peak day</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{maxEntry.date}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {max.toFixed(3)} <span className="text-xs font-normal text-muted-foreground">kWh</span>
                </p>
              </div>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`gradient-${fuel}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    unit=" kWh"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "0.8rem",
                    }}
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value) => [`${Number(value).toFixed(3)} kWh`, "Consumption"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="consumption_kwh"
                    stroke={color}
                    strokeWidth={1.5}
                    fill={`url(#gradient-${fuel})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}