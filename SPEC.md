# Octopus Dashboard — Static (Client-Side Only) Version

A guide to rebuilding this app as a pure client-side SPA — no backend, no server secrets. All credentials are entered once by the user and stored in `localStorage`. The Octopus Energy API is called directly from the browser.

---

## Overview

| Aspect | This (React + FastAPI) | Static version |
|---|---|---|
| Credentials | Server env vars | `localStorage` |
| API calls | Python backend proxies | Browser `fetch()` direct to `https://api.octopus.energy` |
| Deployment | Needs a server | Any static host (GitHub Pages, Netlify, Cloudflare Pages) |
| CORS | Not needed | Octopus API allows `*` — no issue |
| Cards | All cards | Electricity · Gas · Current Tariff · What-If |

---

## Tech Stack

Same as this project — keep everything:

```
React + TypeScript + Vite
Tailwind CSS
shadcn/ui components
recharts
react-hook-form + zod
```

The only thing removed is the FastAPI backend (`app.py`, `routes.py`, `secrets_utils.py`, `pyproject.toml`).

---

## localStorage Schema

All credentials live under a single key: `octopus_config`.

```ts
// src/types.ts (add this)
export interface OctopusConfig {
  accountNumber: string; // e.g. A-XXXXXXXX
  apiKey: string;        // sk_live_…
  elMpan: string;        // 13-digit electricity MPAN
  elSn: string;          // electricity meter serial number
  gasMprn: string;       // gas MPRN
  gasSn: string;         // gas meter serial number
}
```

```ts
// src/lib/config.ts  — read / write helpers
const KEY = "octopus_config";

export function loadConfig(): OctopusConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OctopusConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: OctopusConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(KEY);
}
```

> **Security note:** `localStorage` is readable by any JS on the same origin. For a personal/local deployment this is fine. Do not host on a shared domain.

---

## Setup Wizard (Modal)

The setup wizard is a multi-step `Dialog` that opens automatically on first load (when no config exists in `localStorage`) and can be reopened any time via a **Settings** button in the header.

### Steps

| Step | Fields |
|---|---|
| 1 — Account | Account number (`A-XXXXXXXX`) |
| 2 — API Key | API key (`sk_live_…`) |
| 3 — Electricity | MPAN (13 digits) · Meter serial number |
| 4 — Gas | MPRN · Meter serial number |

### Component sketch

```tsx
// src/components/SetupWizard.tsx
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form"
import { saveConfig } from "@/lib/config"
import type { OctopusConfig } from "@/types"

const steps = ["Account", "API Key", "Electricity", "Gas"] as const

// One zod schema per step — validate only what's on screen
const stepSchemas = [
  z.object({ accountNumber: z.string().regex(/^A-[A-Z0-9]+$/, "Format: A-XXXXXXXX") }),
  z.object({ apiKey: z.string().min(20, "Looks too short") }),
  z.object({ elMpan: z.string().length(13, "MPAN must be 13 digits"), elSn: z.string().min(1) }),
  z.object({ gasMprn: z.string().min(6), gasSn: z.string().min(1) }),
]

interface Props {
  open: boolean
  onComplete: (cfg: OctopusConfig) => void
  initialValues?: OctopusConfig | null
}

export function SetupWizard({ open, onComplete, initialValues }: Props) {
  const [step, setStep] = useState(0)
  const [partial, setPartial] = useState<Partial<OctopusConfig>>(initialValues ?? {})

  const form = useForm({
    resolver: zodResolver(stepSchemas[step]),
    defaultValues: partial,
  })

  function onNext(values: Partial<OctopusConfig>) {
    const merged = { ...partial, ...values }
    setPartial(merged)
    if (step < steps.length - 1) {
      setStep(step + 1)
      form.reset({ ...merged })
    } else {
      // Final step — save and close
      saveConfig(merged as OctopusConfig)
      onComplete(merged as OctopusConfig)
    }
  }

  return (
    <Dialog open={open}>
      {/* No DialogClose X — user must complete or already have config */}
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            Setup ({step + 1}/{steps.length}) — {steps[step]}
          </DialogTitle>
          {/* Step dots */}
          <div className="flex gap-1.5 pt-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onNext)} className="space-y-4 pt-2">

            {/* Step 0 — Account */}
            {step === 0 && (
              <FormField control={form.control} name="accountNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account number</FormLabel>
                  <FormControl><Input placeholder="A-XXXXXXXX" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Step 1 — API Key */}
            {step === 1 && (
              <FormField control={form.control} name="apiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="sk_live_…" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Find this under <em>Developer Settings</em> in your Octopus account.
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Step 2 — Electricity */}
            {step === 2 && (
              <>
                <FormField control={form.control} name="elMpan" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Electricity MPAN</FormLabel>
                    <FormControl><Input placeholder="1234567890123" maxLength={13} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="elSn" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meter serial number</FormLabel>
                    <FormControl><Input placeholder="E1B12345" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}

            {/* Step 3 — Gas */}
            {step === 3 && (
              <>
                <FormField control={form.control} name="gasMprn" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gas MPRN</FormLabel>
                    <FormControl><Input placeholder="1234567890" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="gasSn" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meter serial number</FormLabel>
                    <FormControl><Input placeholder="G4P12345" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}

            <div className="flex justify-between pt-2">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              ) : <div />}
              <Button type="submit">
                {step < steps.length - 1 ? "Next" : "Save & continue"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

### Trigger it from App.tsx

```tsx
// src/App.tsx
import { useState, useEffect } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SetupWizard } from "@/components/SetupWizard"
import { loadConfig } from "@/lib/config"
import type { OctopusConfig } from "@/types"

export default function App() {
  const [config, setConfig] = useState<OctopusConfig | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    const saved = loadConfig()
    if (saved) {
      setConfig(saved)
    } else {
      setWizardOpen(true) // First run — open automatically
    }
  }, [])

  function handleSetupComplete(cfg: OctopusConfig) {
    setConfig(cfg)
    setWizardOpen(false)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Settings button */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Octopus Dashboard</h1>
        <Button variant="ghost" size="sm" onClick={() => setWizardOpen(true)}>
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </header>

      <SetupWizard
        open={wizardOpen}
        onComplete={handleSetupComplete}
        initialValues={config}
      />

      {config && <Dashboard config={config} />}
    </div>
  )
}
```

---

## Direct API Calls (replacing the FastAPI backend)

Every route in `routes.py` has a direct browser equivalent. All calls use HTTP Basic Auth: `apiKey` as username, empty string as password.

```ts
// src/lib/octopus.ts
const BASE = "https://api.octopus.energy/v1"

function authHeader(apiKey: string) {
  return "Basic " + btoa(`${apiKey}:`)
}
```

### `/api/meter-info` → `getMeterInfo()`

```ts
// 1. Get GSP region from the electricity meter point
async function getGspRegion(cfg: OctopusConfig): Promise<string> {
  const r = await fetch(
    `${BASE}/electricity-meter-points/${cfg.elMpan}/`,
    { headers: { Authorization: authHeader(cfg.apiKey) } }
  )
  if (!r.ok) return "A"
  const data = await r.json()
  return (data.gsp as string ?? "_A").replace("_", "")
}

// 2. Get the active tariff from the account
async function getCurrentTariffs(cfg: OctopusConfig) {
  const r = await fetch(
    `${BASE}/accounts/${cfg.accountNumber}/`,
    { headers: { Authorization: authHeader(cfg.apiKey) } }
  )
  if (!r.ok) return {}
  const data = await r.json()
  // ... same parsing logic as _get_current_tariffs() in routes.py
  // Walk properties → electricity_meter_points → agreements → find active
}

export async function getMeterInfo(cfg: OctopusConfig) {
  const region = await getGspRegion(cfg)
  const current = await getCurrentTariffs(cfg)
  return { gspRegion: region, currentTariff: current }
}
```

### `/api/consumption` → `getConsumption()`

```ts
export async function getConsumption(cfg: OctopusConfig, days = 30) {
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  async function fetchFuel(type: "electricity" | "gas", mpan: string, sn: string) {
    const path = type === "electricity"
      ? `electricity-meter-points/${mpan}/meters/${sn}/consumption/`
      : `gas-meter-points/${mpan}/meters/${sn}/consumption/`

    let url: string | null =
      `${BASE}/${path}?page_size=25000&order_by=period&period_from=${since}`
    const all: any[] = []

    while (url) {
      const r = await fetch(url, { headers: { Authorization: authHeader(cfg.apiKey) } })
      const body = await r.json()
      all.push(...(body.results ?? []))
      url = body.next ?? null
    }

    // Aggregate by day
    const daily: Record<string, number> = {}
    for (const item of all) {
      const day = (item.interval_start ?? item.period ?? "").slice(0, 10)
      if (day) daily[day] = (daily[day] ?? 0) + item.consumption
    }
    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, consumption_kwh]) => ({ date, consumption_kwh: Math.round(consumption_kwh * 1000) / 1000 }))
  }

  const [electricity, gas] = await Promise.all([
    fetchFuel("electricity", cfg.elMpan, cfg.elSn),
    fetchFuel("gas", cfg.gasMprn, cfg.gasSn),
  ])

  return { electricity, gas }
}
```

### `/api/cost-analysis` → `getCostAnalysis()`

```ts
const COMPARISON_TARIFFS = [
  // Copy the COMPARISON_TARIFFS array verbatim from routes.py (converted to TS)
  { key: "VAR-22-11-01",       name: "Flexible Octopus",           elTpl: "E-1R-VAR-22-11-01-{r}",          gasTpl: "G-1R-VAR-22-11-01-{r}" },
  { key: "OE-FIX-12M-26-06-18",name: "Octopus 12M Fixed (Jun 26)",  elTpl: "E-1R-OE-FIX-12M-26-06-18-{r}",  gasTpl: "G-1R-OE-FIX-12M-26-06-18-{r}" },
  { key: "AGILE-24-10-01",     name: "Agile Octopus",               elTpl: "E-1R-AGILE-24-10-01-{r}",        gasTpl: null },
  { key: "COSY-22-12-08",      name: "Cosy Octopus",                elTpl: "E-1R-COSY-22-12-08-{r}",         gasTpl: null },
  { key: "GO-FIX-12M-26-06-13",name: "Octopus Go 12M Fixed",        elTpl: "E-1R-GO-FIX-12M-26-06-13-{r}",  gasTpl: null },
]

async function fetchTariffRates(
  productCode: string, tariffCode: string, fuel: "electricity" | "gas", apiKey: string
) {
  // Try product-level static rates first
  const r = await fetch(`${BASE}/products/${productCode}/`, {
    headers: { Authorization: authHeader(apiKey) }
  })
  if (r.ok) {
    const prod = await r.json()
    const tariffs = fuel === "electricity"
      ? prod.single_register_electricity_tariffs
      : prod.single_register_gas_tariffs
    for (const region of Object.values(tariffs ?? {})) {
      for (const method of Object.values(region as any)) {
        const d = method as any
        if (d.code === tariffCode && d.standard_unit_rate_inc_vat != null) {
          return { unit_rate_p: d.standard_unit_rate_inc_vat, standing_charge_p: d.standing_charge_inc_vat ?? 0 }
        }
      }
    }
  }
  // Fallback: unit-rates endpoint
  const fuel_path = fuel === "electricity" ? "electricity-tariffs" : "gas-tariffs"
  const rate_type = fuel === "electricity" ? "standard-unit-rates" : "standard-unit-rates"
  const [rr, sr] = await Promise.all([
    fetch(`${BASE}/products/${productCode}/${fuel_path}/${tariffCode}/${rate_type}/?page_size=1&order_by=period`, { headers: { Authorization: authHeader(apiKey) } }),
    fetch(`${BASE}/products/${productCode}/${fuel_path}/${tariffCode}/standing-charges/?page_size=1&order_by=period`, { headers: { Authorization: authHeader(apiKey) } }),
  ])
  if (!rr.ok) return null
  const results = (await rr.json()).results ?? []
  if (!results.length) return null
  const sc_results = (await sr.json()).results ?? []
  return {
    unit_rate_p: results.at(-1).value_inc_vat,
    standing_charge_p: sc_results.at(-1)?.value_inc_vat ?? 0,
  }
}

export async function getCostAnalysis(cfg: OctopusConfig, days = 30) {
  const [{ electricity: elData, gas: gasData }, region, currentTariffs] = await Promise.all([
    getConsumption(cfg, days),
    getGspRegion(cfg),
    getCurrentTariffs(cfg),
  ])

  // Build tariff list — current tariff first, then comparison tariffs
  const tariffList = [
    // Insert "Your Current Tariff" as first entry if we have account data
    ...(currentTariffs.electricity ? [{
      key: "__current__",
      name: "Your Current Tariff",
      elCode: currentTariffs.electricity.tariff_code,
      elProduct: currentTariffs.electricity.product_code,
      gasCode: currentTariffs.gas?.tariff_code ?? null,
      gasProduct: currentTariffs.gas?.product_code ?? null,
    }] : []),
    ...COMPARISON_TARIFFS.map(t => ({
      key: t.key,
      name: t.name,
      elCode: t.elTpl?.replace("{r}", region) ?? null,
      elProduct: t.key,
      gasCode: t.gasTpl?.replace("{r}", region) ?? null,
      gasProduct: t.key,
    })),
  ]

  // Fetch rates for each tariff in parallel
  const rateResults = await Promise.all(
    tariffList.map(async (t) => ({
      ...t,
      elRates: t.elCode ? await fetchTariffRates(t.elProduct, t.elCode, "electricity", cfg.apiKey) : null,
      gasRates: t.gasCode ? await fetchTariffRates(t.gasProduct, t.gasCode, "gas", cfg.apiKey) : null,
    }))
  )

  // Calculate scenario totals
  const scenarios = rateResults.map(t => {
    let total = 0
    if (t.elRates && elData.length) {
      for (const d of elData) total += (d.consumption_kwh * t.elRates.unit_rate_p + t.elRates.standing_charge_p) / 100
    }
    if (t.gasRates && gasData.length) {
      for (const d of gasData) total += (d.consumption_kwh * t.gasRates.unit_rate_p + t.gasRates.standing_charge_p) / 100
    }
    return { key: t.key, name: t.name, total_cost_gbp: Math.round(total * 100) / 100, electricity: t.elRates, gas: t.gasRates }
  })

  // Daily what-if breakdown
  const allDates = [...new Set([...elData.map(d => d.date), ...gasData.map(d => d.date)])].sort()
  const daily_whatif = allDates.map(date => {
    const row: Record<string, number | string> = { date }
    for (const t of rateResults) {
      let cost = 0
      const el = elData.find(d => d.date === date)
      const gas = gasData.find(d => d.date === date)
      if (t.elRates && el) cost += (el.consumption_kwh * t.elRates.unit_rate_p + t.elRates.standing_charge_p) / 100
      if (t.gasRates && gas) cost += (gas.consumption_kwh * t.gasRates.unit_rate_p + t.gasRates.standing_charge_p) / 100
      row[t.key] = Math.round(cost * 100) / 100
    }
    return row
  })

  return {
    scenarios,
    daily_whatif,
    current_key: currentTariffs.electricity ? "__current__" : "VAR-22-11-01",
  }
}
```

---

## The Four Cards

Only these four cards are included (lifted from `App.tsx`):

| Card | Source data | Component |
|---|---|---|
| **Electricity** | `getConsumption()` → `.electricity` | `MeterCard` with `Zap` icon |
| **Gas** | `getConsumption()` → `.gas` | `MeterCard` with `Flame` icon |
| **Current Tariff** | `getCostAnalysis()` → `scenarios[0]` | `TariffInfoCard` |
| **What-If** | `getCostAnalysis()` → `scenarios` + `daily_whatif` | `WhatIfDailyChart` |

These components can be copied verbatim from `src/App.tsx` in this project — no changes required since they receive plain data props.

---

## App.tsx — Dashboard section

```tsx
// Dashboard component — rendered only when config exists
function Dashboard({ config }: { config: OctopusConfig }) {
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [consumption, setConsumption] = useState<{ electricity: DailyConsumption[], gas: DailyConsumption[] } | null>(null)
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getConsumption(config, days),
      getCostAnalysis(config, days),
    ])
      .then(([cons, cost]) => {
        setConsumption(cons)
        setCostAnalysis(cost)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [config, days])

  // ... render four cards
}
```

---

## Deployment

Because there is no backend, `vite build` produces a self-contained `dist/` folder deployable anywhere:

```bash
bunx --bun vite build
```

**GitHub Pages:**
```yaml
# .github/workflows/deploy.yml
- run: bun install && bunx --bun vite build
- uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./dist
```

**Netlify / Cloudflare Pages:**  
Connect repo → build command: `bun run build` → publish directory: `dist`

**Vite `base` config** — if not deploying to `/`, set in `vite.config.ts`:
```ts
export default defineConfig({
  base: "/octopus-dashboard/", // GitHub Pages repo subpath
})
```

---

## CORS

Octopus Energy's API sets `Access-Control-Allow-Origin: *` on all responses, so browser `fetch()` works without a proxy.

---

## What to Remove

When starting from this project:

| File | Action |
|---|---|
| `app.py` | Delete |
| `routes.py` | Delete |
| `secrets_utils.py` | Delete |
| `pyproject.toml` | Delete (or keep for tooling) |
| `uv.lock` | Delete |
| `.venv/` | Delete |
| `start.sh` | Replace with `bunx --bun vite` only |
| `vite.config.ts` | Remove `/api` proxy block |

---

## File Structure (static version)

```
src/
  App.tsx                   # Root — wizard state + Dashboard render
  main.tsx                  # Unchanged
  types.ts                  # Add OctopusConfig interface
  lib/
    config.ts               # loadConfig / saveConfig / clearConfig
    octopus.ts              # All direct API functions
    utils.ts                # Unchanged
  components/
    SetupWizard.tsx         # Multi-step credentials dialog
    MeterCard.tsx           # Electricity / Gas area chart card
    TariffInfoCard.tsx      # Current tariff rates card
    WhatIfDailyChart.tsx    # Daily cost comparison line chart
    ui/                     # shadcn/ui — unchanged
index.html
vite.config.ts              # Remove /api proxy
package.json
```
