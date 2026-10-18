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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock } from "lucide-react";
import { getYearOverYearCost, getYearOverYearTemps, type YoYPoint, type TempPoint } from "@/lib/octopus";
import type { OctopusConfig } from "@/types";

type Fuel = "both" | "electricity" | "gas";
type Mode = "cumulative" | "daily";

/** Today is always partial / not yet published, so charts stop at yesterday. */
const HDD_BASE = 15.5; // °C, UK standard base temperature for heating degree days
const todayStr = () => new Date().toISOString().slice(0, 10);

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
  const [temps, setTemps] = useState<TempPoint[] | null>(null);
  const [tempView, setTempView] = useState<"temp" | "hdd">("temp");
  const [includeSc, setIncludeSc] = useState(false);
  const [metric, setMetric] = useState<"cost" | "eff">("cost");
  const [fuel, setFuel] = useState<Fuel>("both");
  const [mode, setMode] = useState<Mode>("cumulative");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getYearOverYearCost(config, days)
      .then((p) => !cancelled && setPoints(p.filter((x) => x.date < todayStr())))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [config, days]);

  useEffect(() => {
    let cancelled = false;
    setTemps(null);
    getYearOverYearTemps(config, days)
      .then((t) => !cancelled && setTemps(t && t.filter((x) => x.date < todayStr())))
      .catch(() => !cancelled && setTemps(null));
    return () => {
      cancelled = true;
    };
  }, [config, days]);

  const tempRows = useMemo(() => {
    const f = (v: number | null) => (v == null ? null : tempView === "hdd" ? Math.max(0, HDD_BASE - v) : v);
    return (temps ?? []).map((t) => {
      const c = f(t.cur);
      const v = f(t.prev);
      return {
        date: t.date,
        prevDate: t.prevDate,
        current: c == null ? null : +c.toFixed(1),
        previous: v == null ? null : +v.toFixed(1),
        diff: c == null || v == null ? null : +(c - v).toFixed(1),
      };
    });
  }, [temps, tempView]);

  // Heating degree days vs gas cost, only over days where both are known for that year.
  const hddStats = useMemo(() => {
    if (!temps) return null;
    const byDate = new Map(points.map((p) => [p.date, p]));
    const acc = { hddCur: 0, hddPrev: 0, gasCur: 0, gasPrev: 0 };
    for (const t of temps) {
      const p = byDate.get(t.date);
      if (!p) continue;
      if (t.cur != null && p.gasCur != null) {
        acc.hddCur += Math.max(0, HDD_BASE - t.cur);
        acc.gasCur += includeSc ? p.gasCur : Math.max(0, p.gasCur - p.gasCurSc);
      }
      if (t.prev != null && p.gasPrev != null) {
        acc.hddPrev += Math.max(0, HDD_BASE - t.prev);
        acc.gasPrev += includeSc ? p.gasPrev : Math.max(0, p.gasPrev - p.gasPrevSc);
      }
    }
    if (acc.hddCur <= 0 || acc.hddPrev <= 0) return null;
    return { ...acc, perCur: acc.gasCur / acc.hddCur, perPrev: acc.gasPrev / acc.hddPrev };
  }, [temps, points, includeSc]);
  const hasTemps = tempRows.some((r) => r.current != null && r.previous != null);

  const { rows, totalCur, totalPrev } = useMemo(() => {
    // Cost for a day, optionally with the standing charge removed (only for days that have data).
    const adj = (v: number | null, sc: number) => (v == null ? null : includeSc ? v : Math.max(0, v - sc));
    const pick = (el: number | null, gas: number | null) => {
      if (fuel === "electricity") return el;
      if (fuel === "gas") return gas;
      return el == null && gas == null ? null : (el ?? 0) + (gas ?? 0);
    };
    let cc = 0;
    let cp = 0;
    const rows = points.map((p) => {
      const cur = pick(adj(p.elCur, p.elCurSc), adj(p.gasCur, p.gasCurSc));
      const prev = pick(adj(p.elPrev, p.elPrevSc), adj(p.gasPrev, p.gasPrevSc));
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
  }, [points, fuel, mode, includeSc]);

  // Efficiency: gas kWh per heating degree day (cumulative ratio, or rolling 7-day ratio in daily mode).
  const effRows = useMemo(() => {
    const tByDate = new Map((temps ?? []).map((t) => [t.date, t]));
    const hdd = (t: number | null) => (t == null ? null : Math.max(0, HDD_BASE - t));
    const MIN_HDD = mode === "cumulative" ? 5 : 3;
    const win: { kc: number; hc: number; kp: number; hp: number }[] = [];
    let ckc = 0, chc = 0, ckp = 0, chp = 0;
    return points.map((p) => {
      const t = tByDate.get(p.date);
      const hc = hdd(t?.cur ?? null);
      const hp = hdd(t?.prev ?? null);
      const okC = hc != null && p.gasCurKwh != null;
      const okP = hp != null && p.gasPrevKwh != null;
      const day = {
        kc: okC ? p.gasCurKwh! : 0, hc: okC ? hc! : 0,
        kp: okP ? p.gasPrevKwh! : 0, hp: okP ? hp! : 0,
      };
      ckc += day.kc; chc += day.hc; ckp += day.kp; chp += day.hp;
      win.push(day);
      if (win.length > 7) win.shift();
      let c: number | null;
      let v: number | null;
      if (mode === "cumulative") {
        c = chc >= MIN_HDD ? ckc / chc : null;
        v = chp >= MIN_HDD ? ckp / chp : null;
      } else {
        const s7 = win.reduce((a, w) => ({ kc: a.kc + w.kc, hc: a.hc + w.hc, kp: a.kp + w.kp, hp: a.hp + w.hp }), { kc: 0, hc: 0, kp: 0, hp: 0 });
        c = s7.hc >= MIN_HDD ? s7.kc / s7.hc : null;
        v = s7.hp >= MIN_HDD ? s7.kp / s7.hp : null;
      }
      return {
        date: p.date,
        prevDate: p.prevDate,
        current: c == null ? null : +c.toFixed(2),
        previous: v == null ? null : +v.toFixed(2),
        diff: c == null || v == null ? null : +(c - v).toFixed(2),
      };
    });
  }, [points, temps, mode]);
  const effTotals = useMemo(() => {
    const last = [...effRows].reverse();
    return mode === "cumulative"
      ? { cur: last.find((r) => r.current != null)?.current ?? null, prev: last.find((r) => r.previous != null)?.previous ?? null }
      : null;
  }, [effRows, mode]);
  const effAvailable = effRows.some((r) => r.current != null && r.previous != null);

  const isEff = metric === "eff" && hasTemps;
  const chartRows = isEff ? effRows : rows;
  const U = isEff ? " kWh/HDD" : "";
  const money = (n: number) => (isEff ? `${n.toFixed(2)}${U}` : `£${n.toFixed(2)}`);

  const hasPrev = points.some((p) => p.elPrev != null || p.gasPrev != null);
  const delta = totalCur - totalPrev;
  const year = new Date().getFullYear();

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm md:col-span-2">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-teal-400" />
          <CardTitle className="text-sm font-medium">{isEff ? "Gas Efficiency vs Same Period Last Year" : "Cost vs Same Period Last Year"}</CardTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasTemps && (
            <Toggle<"cost" | "eff">
              value={metric}
              onChange={setMetric}
              options={[["cost", "Cost"], ["eff", "Efficiency"]]}
            />
          )}
          {!isEff && (
          <>
          <Toggle<Fuel>
            value={fuel}
            onChange={setFuel}
            options={[["both", "Total"], ["electricity", "Electricity"], ["gas", "Gas"]]}
          />
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Standing charge
            <Switch
              checked={includeSc}
              onCheckedChange={setIncludeSc}
              className="h-4 w-7 data-[state=checked]:bg-pink-500 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
            />
          </label>
          </>
          )}
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
            {isEff ? (
              <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {effTotals && effTotals.cur != null && effTotals.prev != null ? (
                  <>
                    <span>{year}: <span className="font-mono text-foreground">{effTotals.cur.toFixed(2)} kWh/HDD</span></span>
                    <span>{year - 1}: <span className="font-mono text-foreground">{effTotals.prev.toFixed(2)} kWh/HDD</span></span>
                    <span>
                      Change:{" "}
                      <span className={`font-mono ${effTotals.cur > effTotals.prev ? "text-red-400" : "text-emerald-400"}`}>
                        {effTotals.cur > effTotals.prev ? "+" : "−"}
                        {Math.abs(((effTotals.cur - effTotals.prev) / effTotals.prev) * 100).toFixed(0)}%
                        {effTotals.cur > effTotals.prev ? " more gas per degree day" : " less gas per degree day (more efficient)"}
                      </span>
                    </span>
                  </>
                ) : (
                  <span>Gas used per heating degree day (lower is better). Switch to Cumulative for the headline figure.</span>
                )}
              </div>
            ) : (
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
            )}
            {isEff && !effAvailable && (
              <p className="mb-2 text-xs text-amber-400">
                Not enough cold days in this period to compute gas per degree day. Try a longer period in heating season.
              </p>
            )}
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartRows} syncId="yoy" margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit={isEff ? "" : " £"} />
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
                      return [name === "Difference" && n > 0 ? `+${money(n)}` : money(n), name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />
                  <Bar dataKey="diff" name="Difference" maxBarSize={14} opacity={0.55}>
                    {chartRows.map((r) => (
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
            {hasTemps && (
              <>
                {hddStats && (
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {[
                      { label: "Heating degree days", cur: hddStats.hddCur, prev: hddStats.hddPrev, fmt: (n: number) => n.toFixed(0), badWhenUp: false, hint: ["colder", "warmer"] },
                      { label: "Gas cost", cur: hddStats.gasCur, prev: hddStats.gasPrev, fmt: (n: number) => `£${n.toFixed(2)}`, badWhenUp: true, hint: null },
                      { label: "Gas £ per degree day", cur: hddStats.perCur, prev: hddStats.perPrev, fmt: (n: number) => `£${n.toFixed(2)}`, badWhenUp: true, hint: null },
                    ].map((t) => {
                      const pct = t.prev ? ((t.cur - t.prev) / t.prev) * 100 : 0;
                      const up = pct > 0;
                      const color = t.badWhenUp ? (up ? "text-red-400" : "text-emerald-400") : "text-muted-foreground";
                      return (
                        <div key={t.label} className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                          <p className="text-[11px] text-muted-foreground">{t.label}</p>
                          <p className="font-mono text-sm">
                            {t.fmt(t.cur)} <span className="text-muted-foreground">vs {t.fmt(t.prev)}</span>
                          </p>
                          <p className={`text-xs font-mono ${color}`}>
                            {up ? "+" : "−"}{Math.abs(pct).toFixed(0)}%{t.hint ? ` ${up ? t.hint[0] : t.hint[1]}` : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mb-1 mt-4 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {tempView === "temp" ? "Mean daily temperature" : `Heating degree days (base ${HDD_BASE}°C)`}
                  </p>
                  <Toggle<"temp" | "hdd">
                    value={tempView}
                    onChange={setTempView}
                    options={[["temp", "Temperature"], ["hdd", "Degree days"]]}
                  />
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={tempRows} syncId="yoy" margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={fmtDate}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        interval="preserveStartEnd"
                        minTickGap={50}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} unit={tempView === "temp" ? "°" : ""} />
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
                          const unit = tempView === "temp" ? "°C" : " HDD";
                          return [name === "Difference" && n > 0 ? `+${n.toFixed(1)}${unit}` : `${n.toFixed(1)}${unit}`, name];
                        }}
                      />
                      <Bar dataKey="diff" name="Difference" maxBarSize={14} opacity={0.55}>
                        {tempRows.map((r) => (
                          <Cell key={r.date} fill={((r.diff ?? 0) > 0) === (tempView === "temp") ? "#fb923c" : "#60a5fa"} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="current" name={String(year)} stroke="#ec4899" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="previous" name={String(year - 1)} stroke="#14b8a6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {isEff ? "Red bars: more gas per degree day than last year; green: less (more efficient). Gas kWh ÷ heating degree days, daily mode uses a rolling 7-day window." : "Red bars: spending more than last year; green: spending less."} {!isEff && <>Costs use the actual tariff rates in effect on each day (inc. VAT{includeSc ? ", incl. standing charge" : ", excl. standing charge"}).</>}{hasTemps && " Weather bars: orange = warmer than last year, blue = colder (degree days: heating needed, so the reverse sign, same colours). Weather from Open-Meteo, located via your account postcode."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
