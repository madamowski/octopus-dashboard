import { useState, useEffect, useCallback } from "react";
import { Settings, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupWizard } from "@/components/SetupWizard";
import { HeroPage } from "@/components/HeroPage";
import { MeterCard } from "@/components/MeterCard";
import { TariffInfoCard } from "@/components/TariffInfoCard";
import { WhatIfTotalCard } from "@/components/WhatIfTotalCard";
import { WhatIfDailyChart } from "@/components/WhatIfDailyChart";
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

function toDays(period: Period): number {
  const now = Date.now();
  const d = new Date();
  if (period === "mtd") {
    return Math.floor((now - new Date(d.getFullYear(), d.getMonth(), 1).getTime()) / 86_400_000);
  }
  if (period === "qtd") {
    const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    return Math.floor((now - new Date(d.getFullYear(), qStartMonth, 1).getTime()) / 86_400_000);
  }
  if (period === "ytd") {
    return Math.floor((now - new Date(d.getFullYear(), 0, 1).getTime()) / 86_400_000);
  }
  return period;
}

function Dashboard({ config }: { config: OctopusConfig }) {
  const [days, setDays] = useState<Period>(30);
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
    const d = toDays(days);
    Promise.all([
      getConsumption(config, d),
      getCostAnalysis(config, d),
    ])
      .then(([cons, cost]) => {
        setConsumption(cons);
        setCostAnalysis(cost);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [config, days]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Period toggle */}
      <div className="mb-6 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
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
          days={toDays(days)}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWizardOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
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
        <HeroPage onConfigure={() => setWizardOpen(true)} />
      )}
    </div>
  );
}
