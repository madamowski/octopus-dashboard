import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock } from "lucide-react";
import { getYearOverYearCost, type YoYPoint } from "@/lib/octopus";
import type { OctopusConfig } from "@/types";

type Fuel = "both" | "electricity" | "gas";
type Mode = "cumulative" | "daily";

const fmtDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtFull = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Toggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === v ? "bg-pink-500/20 text-pink-400 shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function YearOverYearChart({ config, days }: { config: OctopusConfig; days: number }) {
  const [points, setPoints] = useState<YoYPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuel, setFuel] = useState<Fuel>("both");
  const [mode, setMode] = useState<Mode>("cumulative");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getYearOverYearCost(config, days)
      .then((p) => !cancelled && setPoints(p))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [config, days]);

  const { rows, totalCur, totalPrev } = useMemo(() => {
    const pick = (el: number | null, gas: number | null) => {
      if (fuel === "electricity") return el;
      if (fuel === "gas") return gas;
      return el == null && gas == null ? null : (el ?? 0) + (gas ?? 0);
    };
    let cc = 0;
    let cp = 0;
    const rows = points.map((p) => {
      const cur = pick(p.elCur, p.gasCur);
      const prev = pick(p.elPrev, p.gasPrev);
      cc += cur ?? 0;
      cp += prev ?? 0;
      const c = mode === "cumulative" ? cc : cur;
      const v = mode === "cumulative" ? cp : prev;
      return {
        date: p.date,
        prevDate: p.prevDate,
        current: c == null ? null : +c.toFixed(2),
        previous: v == null ? null : +v.toFixed(2),
        diff: c == null || v == null ? null : +(c - v).toFixed(2),
      };
    });
    return { rows, totalCur: cc, totalPrev: cp };
  }, [points, fuel, mode]);

  const hasPrev = points.some((p) => p.elPrev != null || p.gasPrev != null);
  const delta = totalCur - totalPrev;
  const year = new Date().getFullYear();

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm md:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-teal-400" />
          <CardTitle className="text-sm font-medium">Cost vs Same Period Last Year</CardTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle<Fuel>
            value={fuel}
            onChange={setFuel}
            options={[["both", "Total"], ["electricity", "Electricity"], ["gas", "Gas"]]}
          />
          <Toggle<Mode>
            value={mode}
            onChange={setMode}
            options={[["cumulative", "Cumulative"], ["daily", "Daily"]]}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !hasPrev ? (
          <p className="text-sm text-muted-foreground">
            No consumption data found for the same period last year.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                {year}: <span className="font-mono text-foreground">£{totalCur.toFixed(2)}</span>
              </span>
              <span>
                {year - 1}: <span className="font-mono text-foreground">£{totalPrev.toFixed(2)}</span>
              </span>
              <span>
                Change:{" "}
                <span className={`font-mono ${delta > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {delta > 0 ? "+" : "−"}£{Math.abs(delta).toFixed(2)}
                  {totalPrev > 0 && ` (${delta > 0 ? "+" : "−"}${Math.abs((delta / totalPrev) * 100).toFixed(0)}%)`}
                </span>
              </span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit=" £" />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "0.8rem",
                    }}
                    labelFormatter={(label, payload) => {
                      const p = payload?.[0]?.payload;
                      return p ? `${fmtFull(p.date)} vs ${fmtFull(p.prevDate)}` : String(label);
                    }}
                    formatter={(value, name) => {
                      const n = Number(value);
                      return [name === "Difference" && n > 0 ? `+£${n.toFixed(2)}` : `£${n.toFixed(2)}`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
                  <Bar dataKey="diff" name="Difference" maxBarSize={14} opacity={0.55}>
                    {rows.map((r) => (
                      <Cell key={r.date} fill={(r.diff ?? 0) > 0 ? "#f87171" : "#34d399"} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="current"
                    name={String(year)}
                    stroke="#ec4899"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="previous"
                    name={String(year - 1)}
                    stroke="#14b8a6"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Red bars: spending more than last year; green: spending less. Costs use the actual tariff rates in effect on each day (inc. VAT, incl. standing charge).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
