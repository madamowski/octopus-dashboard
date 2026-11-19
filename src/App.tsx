import { useState, useEffect, useCallback } from "react";
import { Settings, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupWizard } from "@/components/SetupWizard";
import { HeroPage } from "@/components/HeroPage";
import { MeterCard } from "@/components/MeterCard";
import { TariffInfoCard } from "@/components/TariffInfoCard";
import { WhatIfTotalCard } from "@/components/WhatIfTotalCard";
import { WhatIfDailyChart } from "@/components/WhatIfDailyChart";
import { YearOverYearChart } from "@/components/YearOverYearChart";
import { DEMO_CONFIG } from "@/lib/demo";
import { loadConfig } from "@/lib/config";
import { getConsumption, getCostAnalysis } from "@/lib/octopus";
import type {
  OctopusConfig,
  ConsumptionResponse,
  CostAnalysisResponse,
} from "@/types";

type Period = 7 | 30 | 90 | 180 | 360 | "mtd" | "qtd" | "ytd";

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "180d", value: 180 },
  { label: "360d", value: 360 },
  { label: "MTD", value: "mtd" },
  { label: "QTD", value: "qtd" },
  { label: "YTD", value: "ytd" },
];

const DAY = 86_400_000;
const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

interface PeriodWindow {
  days: number; // span back from `end`
  end?: number; // undefined = now
  label: string | null; // null for the live window
}

/** Window for a period shifted `offset` periods back (0 = current). Dates are UTC-noon timestamps. */
function getWindow(period: Period, offset: number): PeriodWindow {
  const d = new Date();
  const todayNoon = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  if (offset === 0) {
    let startNoon: number | null = null;
    if (period === "mtd") startNoon = Date.UTC(d.getFullYear(), d.getMonth(), 1, 12);
    else if (period === "qtd") startNoon = Date.UTC(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1, 12);
    else if (period === "ytd") startNoon = Date.UTC(d.getFullYear(), 0, 1, 12);
    return { days: startNoon === null ? (period as number) : Math.round((todayNoon - startNoon) / DAY), label: null };
  }
  if (typeof period === "number") {
    const end = todayNoon - offset * (period + 1) * DAY;
    return { days: period, end, label: `${fmtDay(end - period * DAY)} – ${fmtDay(end)}` };
  }
  const y = d.getFullYear(), m = d.getMonth();
  const step = period === "mtd" ? 1 : period === "qtd" ? 3 : 12;
  const curStartMonth = period === "mtd" ? m : period === "qtd" ? Math.floor(m / 3) * 3 : 0;
  const startMonth = curStartMonth - offset * step;
  const start = Date.UTC(y, startMonth, 1, 12);
  const end = Date.UTC(y, startMonth + step, 0, 12);
  return { days: Math.round((end - start) / DAY), end, label: `${fmtDay(start)} – ${fmtDay(end)}` };
}

function Dashboard({ config }: { config: OctopusConfig }) {
  const [days, setDays] = useState<Period>(30);
  const [offset, setOffset] = useState(0);
  const win = getWindow(days, offset);
  const [consumption, setConsumption] = useState<ConsumptionResponse | null>(
    null
  );
  const [costAnalysis, setCostAnalysis] =
    useState<CostAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const w = getWindow(days, offset);
    Promise.all([
      getConsumption(config, w.days, w.end),
      getCostAnalysis(config, w.days, w.end),
    ])
      .then(([cons, cost]) => {
        setConsumption(cons);
        setCostAnalysis(cost);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [config, days, offset]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Period toggle */}
      <div className="mb-6 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setDays(opt.value); setOffset(0); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                days === opt.value
                  ? "bg-pink-500/20 text-pink-400 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-1 flex items-center gap-1">
          <button
            aria-label="Previous period"
            onClick={() => setOffset((o) => o + 1)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Next period"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {win.label && (
            <>
              <span className="ml-1 text-xs text-muted-foreground">{win.label}</span>
              <button
                onClick={() => setOffset(0)}
                className="ml-1 text-xs text-pink-400 hover:underline"
              >
                Latest
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MeterCard
          title="Electricity"
          data={consumption?.electricity ?? []}
          loading={loading}
          error={error}
          fuel="electricity"
        />
        <MeterCard
          title="Gas"
          data={consumption?.gas ?? []}
          loading={loading}
          error={error}
          fuel="gas"
        />
        <TariffInfoCard
          scenarios={costAnalysis?.scenarios ?? []}
          currentKey={costAnalysis?.current_key ?? ""}
          days={win.days}
          loading={loading}
          error={error}
        />
        <WhatIfTotalCard
          scenarios={costAnalysis?.scenarios ?? []}
          currentKey={costAnalysis?.current_key ?? ""}
          loading={loading}
          error={error}
        />
        <div className="md:col-span-2">
          <WhatIfDailyChart
            dailyWhatIf={costAnalysis?.daily_whatif ?? []}
            scenarios={costAnalysis?.scenarios ?? []}
            currentKey={costAnalysis?.current_key ?? ""}
            loading={loading}
            error={error}
          />
        </div>
        <div className="md:col-span-2">
          <YearOverYearChart config={config} days={win.days} end={win.end} />
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [config, setConfig] = useState<OctopusConfig | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadConfig();
    if (saved) {
      setConfig(saved);
    }
    setReady(true);
  }, []);

  const handleSetupComplete = useCallback((cfg: OctopusConfig) => {
    setConfig(cfg);
    setWizardOpen(false);
  }, []);

  function handleClose() {
    setWizardOpen(false);
    // If credentials were cleared, reset to hero
    if (!loadConfig()) setConfig(null);
  }

  return (
    <div className="min-h-screen bg-background bg-grid">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/20">
              <svg
                className="h-4 w-4 text-pink-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">
              Octopus Dashboard
            </h1>
            {config && (
              <span className="hidden text-xs text-muted-foreground font-mono sm:inline">
                {config.accountNumber}
              </span>
            )}
          </div>
          {config?.demo ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-0.5 text-xs text-pink-400">
                Demo data
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfig(loadConfig())}
                className="text-muted-foreground hover:text-foreground"
              >
                Exit demo
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWizardOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="mr-1.5 h-3.5 w-3.5" />
              Settings
            </Button>
          )}
        </div>
      </header>

      <SetupWizard
        open={wizardOpen}
        onComplete={handleSetupComplete}
        onClose={handleClose}
        initialValues={config}
      />

      {!ready ? null : config ? (
        <Dashboard config={config} />
      ) : (
        <HeroPage onConfigure={() => setWizardOpen(true)} onDemo={() => setConfig(DEMO_CONFIG)} />
      )}
    </div>
  );
}
