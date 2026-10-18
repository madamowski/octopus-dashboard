import { useState } from "react";
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
import { Zap, Flame, BarChart3, Table2 } from "lucide-react";
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
  const [view, setView] = useState<"chart" | "table">("chart");
  const color = fuel === "electricity" ? "#ec4899" : "#14b8a6";
  const Icon = fuel === "electricity" ? Zap : Flame;
  const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));

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
        {!loading && !error && data.length > 0 && (
          <div
            role="group"
            aria-label="Switch view"
            className="flex items-center rounded-md border border-border/50 bg-background/40 p-0.5"
          >
            {([
              ["chart", BarChart3, "Chart view"],
              ["table", Table2, "Table view"],
            ] as const).map(([key, ViewIcon, label]) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={view === key}
                title={label}
                onClick={() => setView(key)}
                className={`flex h-6 w-7 items-center justify-center rounded transition-colors ${
                  view === key
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ViewIcon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
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
            {view === "table" ? (
              <>
              <div className="max-h-[310px] overflow-y-auto rounded-md border border-border/40">
                <table className="w-full text-xs tabular-nums">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr className="h-7 border-b border-border/40">
                      <th className="px-3 text-left font-medium">Date</th>
                      <th className="px-3 text-right font-medium">Meter reading</th>
                      <th className="px-3 text-right font-medium">Consumption</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((d) => (
                      <tr key={d.date} className="h-7 border-b border-border/20 last:border-0">
                        <td className="px-3">{formatDate(d.date)}</td>
                        <td className="px-3 text-right">
                          {d.reading != null ? (
                            <span
                              className={d.readingEstimated ? "text-muted-foreground" : ""}
                              title={d.readingEstimated ? "Estimated from nearest meter reading + daily usage" : "Meter reading"}
                            >
                              {d.readingEstimated && "~"}
                              {d.reading.toFixed(fuel === "gas" ? 2 : 1)}{" "}
                              <span className="text-muted-foreground">{fuel === "gas" ? "m³" : "kWh"}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 text-right" style={{ color }}>
                          {d.consumption_kwh.toFixed(3)}{" "}
                          <span className="text-muted-foreground">kWh</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sorted.some((d) => d.readingEstimated) && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  ~ estimated from the nearest recorded meter reading plus daily usage
                </p>
              )}
              </>
            ) : (
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
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}