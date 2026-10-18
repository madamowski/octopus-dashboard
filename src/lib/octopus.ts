import type {
  OctopusConfig,
  ConsumptionResponse,
  CostAnalysisResponse,
  DailyConsumption,
  Scenario,
  RateResult,
  TariffRates,
} from "@/types";

import { demoConsumption, demoCostAnalysis, demoYearOverYear, demoYearOverYearTemps } from "@/lib/demo";

const BASE = "https://api.octopus.energy/v1";
// m³ → kWh: volume × 1.02264 (correction) × 39.5 (calorific value) / 3.6
const GAS_M3_TO_KWH = (1.02264 * 39.5) / 3.6;

function authHeader(apiKey: string) {
  return "Basic " + btoa(`${apiKey}:`);
}

// --------------- GSP region from electricity meter point ---------------

async function getGspRegion(cfg: OctopusConfig): Promise<string> {
  const r = await fetch(`${BASE}/electricity-meter-points/${cfg.elMpan}/`, {
    headers: { Authorization: authHeader(cfg.apiKey) },
  });
  if (!r.ok) return "A";
  const data = await r.json();
  return ((data.gsp as string) ?? "_A").replace("_", "");
}

// --------------- Current tariffs from account ---------------

async function getCurrentTariffs(cfg: OctopusConfig) {
  const r = await fetch(`${BASE}/accounts/${cfg.accountNumber}/`, {
    headers: { Authorization: authHeader(cfg.apiKey) },
  });
  if (!r.ok) return {};
  const data = await r.json();
  const now = new Date().toISOString();

  let electricityTariff: { tariff_code: string; product_code: string; product_name: string; valid_to: string | null } | undefined;
  let gasTariff: { tariff_code: string; product_code: string; product_name: string; valid_to: string | null } | undefined;

  for (const prop of data.properties ?? []) {
    for (const mpoint of prop.electricity_meter_points ?? []) {
      const active = (mpoint.agreements ?? []).find(
        (a: { valid_from: string; valid_to: string | null; tariff_code: string }) =>
          a.valid_from <= now && (!a.valid_to || a.valid_to > now)
      );
      if (active) {
        const productCode = (active.tariff_code ?? "").replace(/^[EG]-\dR-(.+)-[A-Z]$/, "$1");
        let productName = productCode;
        try {
          const pr = await fetch(`${BASE}/products/${productCode}/`, { headers: { Authorization: authHeader(cfg.apiKey) } });
          if (pr.ok) { const pd = await pr.json(); productName = pd.display_name ?? pd.full_name ?? productCode; }
        } catch { /* ignore */ }
        electricityTariff = {
          tariff_code: active.tariff_code ?? mpoint.tariff_code ?? "",
          product_code: productCode,
          product_name: productName,
          valid_to: active.valid_to ?? null,
        };
      }
    }
    for (const mpoint of prop.gas_meter_points ?? []) {
      const active = (mpoint.agreements ?? []).find(
        (a: { valid_from: string; valid_to: string | null; tariff_code: string }) =>
          a.valid_from <= now && (!a.valid_to || a.valid_to > now)
      );
      if (active) {
        const productCode = (active.tariff_code ?? "").replace(/^[EG]-\dR-(.+)-[A-Z]$/, "$1");
        gasTariff = {
          tariff_code: active.tariff_code ?? mpoint.tariff_code ?? "",
          product_code: productCode,
          product_name: electricityTariff?.product_name ?? productCode, // reuse if same product
          valid_to: active.valid_to ?? null,
        };
      }
    }
  }

  return {
    electricity: electricityTariff ? { ...electricityTariff } : undefined,
    gas: gasTariff ? { ...gasTariff } : undefined,
  };
}

// --------------- Meter readings (GraphQL) ---------------

const GQL = "https://api.octopus.energy/v1/graphql/";

async function gql<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.json();
  if (body.errors?.length) console.warn("[graphql]", body.errors.map((e: { message: string }) => e.message));
  if (body.errors?.length && !body.data) throw new Error(body.errors[0].message);
  return body.data as T;
}

const localDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

/** Latest register reading per local day, keyed by YYYY-MM-DD. Never throws. */
async function getMeterReadings(
  cfg: OctopusConfig,
  since: string
): Promise<{ electricity: Record<string, number>; gas: Record<string, number> }> {
  const empty = { electricity: {}, gas: {} };
  try {
    const auth = await gql<{ obtainKrakenToken: { token: string } }>(
      `mutation($k:String!){ obtainKrakenToken(input:{APIKey:$k}){ token } }`,
      { k: cfg.apiKey }
    );
    const token = auth.obtainKrakenToken.token;

    type Meter = { id: string; serialNumber: string };
    type Node = { readAt: string; registers: { value: string }[] };

    async function fuelReadings(fuel: "electricity" | "gas", id: string, sn: string) {
      const isEl = fuel === "electricity";
      const mpQuery = `query($acc:String!){ account(accountNumber:$acc){ ${
        isEl
          ? "electricityAgreements{ meterPoint{ mpan meters{ id serialNumber } } }"
          : "gasAgreements{ meterPoint{ mprn meters{ id serialNumber } } }"
      } } }`;
      type Agr = { meterPoint: { mpan?: string; mprn?: string; meters: Meter[] } | null };
      const acct = await gql<{ account: Record<string, Agr[]> | null }>(mpQuery, { acc: cfg.accountNumber }, token);
      const agreements = Object.values(acct.account ?? {})[0] ?? [];
      const points = agreements.map((a) => a.meterPoint).filter(Boolean) as NonNullable<Agr["meterPoint"]>[];
      const meters = (points.find((p) => (p.mpan ?? p.mprn) === id) ?? points[0])?.meters ?? [];
      const meter = meters.find((m) => m.serialNumber === sn) ?? meters[meters.length - 1];
      if (!meter) {
        console.warn(`[readings] no ${fuel} meter found on account`);
        return {};
      }

      const field = isEl ? "electricityMeterReadings" : "gasMeterReadings";
      type Page = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: Node }[] };
      const edges: { node: Node }[] = [];
      let after: string | null = null;
      // Octopus rejects page sizes above 100 ("Invalid pagination parameters").
      for (let i = 0; i < 20; i++) {
        const data: Record<string, Page> = await gql(
          `query($acc:String!,$m:String!,$from:DateTime,$after:String){ ${field}(accountNumber:$acc, meterId:$m, readFrom:$from, first:100, after:$after){ pageInfo{ hasNextPage endCursor } edges{ node{ readAt registers{ value } } } } }`,
          { acc: cfg.accountNumber, m: meter.id, from: since, after },
          token
        );
        const page = data[field];
        edges.push(...(page?.edges ?? []));
        if (!page?.pageInfo?.hasNextPage) break;
        after = page.pageInfo.endCursor;
      }
      if (!edges.length) console.warn(`[readings] ${fuel}: query returned 0 readings`);
      const latest: Record<string, { at: string; value: number }> = {};
      for (const { node } of edges) {
        const value = node.registers.reduce((s, r) => s + parseFloat(r.value), 0);
        if (!Number.isFinite(value)) continue;
        const day = localDay(node.readAt);
        if (!latest[day] || node.readAt > latest[day].at) latest[day] = { at: node.readAt, value };
      }
      return Object.fromEntries(Object.entries(latest).map(([d, v]) => [d, v.value]));
    }

    const [electricity, gas] = await Promise.all([
      fuelReadings("electricity", cfg.elMpan, cfg.elSn).catch((e) => { console.warn("[readings] electricity:", e); return {}; }),
      fuelReadings("gas", cfg.gasMprn, cfg.gasSn).catch((e) => { console.warn("[readings] gas:", e); return {}; }),
    ]);
    return { electricity, gas };
  } catch (e) {
    console.warn("[readings] auth failed:", e);
    return empty;
  }
}

// --------------- Consumption ---------------

export async function getConsumption(
  cfg: OctopusConfig,
  days = 30
): Promise<ConsumptionResponse> {
  if (cfg.demo) return demoConsumption(days);
  const rangeStart = new Date(Date.now() - days * 86_400_000);
  const rangeStartDay = rangeStart.toISOString().slice(0, 10);

  // Octopus only stores sparse (roughly monthly) register readings, so look back
  // far enough to find an anchor before the range and extend consumption to it.
  const anchors = await getMeterReadings(
    cfg,
    new Date(rangeStart.getTime() - 62 * 86_400_000).toISOString()
  );
  const earliestNeeded = (map: Record<string, number>) => {
    const before = Object.keys(map).filter((d) => d <= rangeStartDay).sort();
    return before.length ? before[before.length - 1] : rangeStartDay;
  };
  const sinceDay = [earliestNeeded(anchors.electricity), earliestNeeded(anchors.gas), rangeStartDay].sort()[0];
  // Start one day early: rows are trimmed to rangeStartDay below, and this covers the BST offset.
  const dayBefore = new Date(new Date(rangeStartDay + "T00:00:00Z").getTime() - 86_400_000).toISOString().slice(0, 10);
  const since = sinceDay === rangeStartDay ? `${dayBefore}T00:00:00Z` : `${sinceDay}T00:00:00Z`;

  async function fetchFuel(
    fuel: "electricity" | "gas",
    mpan: string,
    sn: string
  ): Promise<DailyConsumption[]> {
    const path =
      fuel === "electricity"
        ? `electricity-meter-points/${mpan}/meters/${sn}/consumption/`
        : `gas-meter-points/${mpan}/meters/${sn}/consumption/`;

    let url: string | null = `${BASE}/${path}?page_size=25000&order_by=period&period_from=${since}`;
    const all: any[] = [];

    while (url) {
      const r = await fetch(url, {
        headers: { Authorization: authHeader(cfg.apiKey) },
      });
      const body = await r.json();
      all.push(...(body.results ?? []));
      url = body.next ?? null;
    }

    const daily: Record<string, number> = {};
    for (const item of all) {
      const day = (item.interval_start ?? item.period ?? "").slice(0, 10);
      if (day) daily[day] = (daily[day] ?? 0) + item.consumption;
    }

    return Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, consumption_kwh]) => ({
        date,
        consumption_kwh: Math.round(consumption_kwh * 1000) / 1000,
      }));
  }

  const [electricity, gas] = await Promise.all([
    fetchFuel("electricity", cfg.elMpan, cfg.elSn),
    fetchFuel("gas", cfg.gasMprn, cfg.gasSn),
  ]);

  /**
   * Register reading at the start of each day. Exact when Octopus has a reading
   * for that day; otherwise estimated from the nearest reading ± daily usage.
   */
  function withReadings(rows: DailyConsumption[], map: Record<string, number>): DailyConsumption[] {
    const anchorDays = Object.keys(map).sort();
    const sumBetween = (from: string, to: string) =>
      rows.reduce((s, r) => (r.date >= from && r.date < to ? s + r.consumption_kwh : s), 0);

    // Today's usage is always partial / not yet published, so never include it.
    const today = new Date().toISOString().slice(0, 10);
    return rows
      .filter((r) => r.date >= rangeStartDay && r.date < today)
      .map((r) => {
        if (map[r.date] != null) return { ...r, reading: map[r.date], readingEstimated: false };
        const prev = [...anchorDays].reverse().find((d) => d < r.date);
        if (prev) return { ...r, reading: map[prev] + sumBetween(prev, r.date), readingEstimated: true };
        const next = anchorDays.find((d) => d > r.date);
        if (next) return { ...r, reading: map[next] - sumBetween(r.date, next), readingEstimated: true };
        return { ...r, reading: null };
      });
  }

  return {
    electricity: withReadings(electricity, anchors.electricity),
    // Gas API consumption is m³ (SMETS2); readings stay in m³, usage is converted to kWh.
    gas: withReadings(gas, anchors.gas).map((r) => ({
      ...r,
      consumption_kwh: Math.round(r.consumption_kwh * GAS_M3_TO_KWH * 1000) / 1000,
    })),
  };
}

// --------------- Tariff rate fetching ---------------

const COMPARISON_TARIFFS = [
  { key: "VAR-22-11-01", name: "Flexible Octopus", elTpl: "E-1R-VAR-22-11-01-{r}", gasTpl: "G-1R-VAR-22-11-01-{r}" },
  { key: "OE-FIX-12M-26-06-18", name: "Octopus 12M Fixed (Jun 26)", elTpl: "E-1R-OE-FIX-12M-26-06-18-{r}", gasTpl: "G-1R-OE-FIX-12M-26-06-18-{r}" },
  { key: "AGILE-24-10-01", name: "Agile Octopus", elTpl: "E-1R-AGILE-24-10-01-{r}", gasTpl: null },
  { key: "COSY-22-12-08", name: "Cosy Octopus", elTpl: "E-1R-COSY-22-12-08-{r}", gasTpl: null },
  { key: "GO-FIX-12M-26-06-13", name: "Octopus Go 12M Fixed", elTpl: "E-1R-GO-FIX-12M-26-06-13-{r}", gasTpl: null },
];

async function fetchTariffRates(
  productCode: string,
  tariffCode: string,
  fuel: "electricity" | "gas",
  apiKey: string
): Promise<TariffRates | null> {
  // Try product-level static rates first
  const r = await fetch(`${BASE}/products/${productCode}/`, {
    headers: { Authorization: authHeader(apiKey) },
  });
  if (r.ok) {
    const prod = await r.json();
    const tariffs =
      fuel === "electricity"
        ? prod.single_register_electricity_tariffs
        : prod.single_register_gas_tariffs;
    if (tariffs) {
      for (const region of Object.values(tariffs) as any[]) {
        for (const method of Object.values(region) as any[]) {
          const d = method as any;
          if (d.code === tariffCode && d.standard_unit_rate_inc_vat != null) {
            return {
              unit_rate_p: d.standard_unit_rate_inc_vat,
              standing_charge_p: d.standing_charge_inc_vat ?? 0,
            };
          }
        }
      }
    }
  }

  // Fallback: unit-rates endpoint
  const fuelPath = fuel === "electricity" ? "electricity-tariffs" : "gas-tariffs";
  const [rr, sr] = await Promise.all([
    fetch(
      `${BASE}/products/${productCode}/${fuelPath}/${tariffCode}/standard-unit-rates/?page_size=1&order_by=period`,
      { headers: { Authorization: authHeader(apiKey) } }
    ),
    fetch(
      `${BASE}/products/${productCode}/${fuelPath}/${tariffCode}/standing-charges/?page_size=1&order_by=period`,
      { headers: { Authorization: authHeader(apiKey) } }
    ),
  ]);

  if (!rr.ok) return null;
  const results = (await rr.json()).results ?? [];
  if (!results.length) return null;
  const scResults = (await sr.json()).results ?? [];

  return {
    unit_rate_p: results.at(-1).value_inc_vat,
    standing_charge_p: scResults.at(-1)?.value_inc_vat ?? 0,
  };
}

// --------------- Cost Analysis ---------------

export async function getCostAnalysis(
  cfg: OctopusConfig,
  days = 30
): Promise<CostAnalysisResponse> {
  if (cfg.demo) return demoCostAnalysis(days);
  const { electricity: elData, gas: gasData } = await getConsumption(cfg, days);
  const region = await getGspRegion(cfg);
  const currentTariffs = await getCurrentTariffs(cfg);

  // Build tariff list
  const tariffList: {
    key: string;
    name: string;
    elCode: string | null;
    elProduct: string;
    gasCode: string | null;
    gasProduct: string;
  }[] = [
    ...(currentTariffs.electricity
      ? [
          {
            key: "__current__",
            name: currentTariffs.electricity.product_name,
            elCode: currentTariffs.electricity.tariff_code,
            elProduct: currentTariffs.electricity.product_code,
            gasCode: currentTariffs.gas?.tariff_code ?? null,
            gasProduct: currentTariffs.gas?.product_code ?? "",
          },
        ]
      : []),
    ...COMPARISON_TARIFFS.map((t) => ({
      key: t.key,
      name: t.name,
      elCode: t.elTpl?.replace("{r}", region) ?? null,
      elProduct: t.key,
      gasCode: t.gasTpl?.replace("{r}", region) ?? null,
      gasProduct: t.key,
    })),
  ];

  // Fetch rates for each tariff in parallel
  const rateResults: RateResult[] = await Promise.all(
    tariffList.map(async (t) => ({
      ...t,
      elRates: t.elCode
        ? await fetchTariffRates(t.elProduct, t.elCode, "electricity", cfg.apiKey)
        : null,
      gasRates: t.gasCode
        ? await fetchTariffRates(t.gasProduct, t.gasCode, "gas", cfg.apiKey)
        : null,
    }))
  );

  // Calculate scenario totals
  const scenarios: Scenario[] = rateResults.map((t) => {
    let total = 0;
    if (t.elRates && elData.length) {
      for (const d of elData)
        total += (d.consumption_kwh * t.elRates.unit_rate_p + t.elRates.standing_charge_p) / 100;
    }
    if (t.gasRates && gasData.length) {
      for (const d of gasData)
        total += (d.consumption_kwh * t.gasRates.unit_rate_p + t.gasRates.standing_charge_p) / 100;
    }
    return {
      key: t.key,
      name: t.name,
      total_cost_gbp: Math.round(total * 100) / 100,
      electricity: t.elRates,
      gas: t.gasRates,
      elTariffCode: t.elCode,
      gasTariffCode: t.gasCode,
      validTo: t.key === "__current__" ? (currentTariffs.electricity?.valid_to ?? null) : null,
    };
  });

  // Daily what-if breakdown
  const allDates = [
    ...new Set([...elData.map((d) => d.date), ...gasData.map((d) => d.date)]),
  ].sort();
  const daily_whatif = allDates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const t of rateResults) {
      let cost = 0;
      const el = elData.find((d) => d.date === date);
      const gas = gasData.find((d) => d.date === date);
      if (t.elRates && el)
        cost += (el.consumption_kwh * t.elRates.unit_rate_p + t.elRates.standing_charge_p) / 100;
      if (t.gasRates && gas)
        cost += (gas.consumption_kwh * t.gasRates.unit_rate_p + t.gasRates.standing_charge_p) / 100;
      row[t.key] = Math.round(cost * 100) / 100;
    }
    return row;
  });

  return {
    scenarios,
    daily_whatif,
    current_key: currentTariffs.electricity ? "__current__" : "VAR-22-11-01",
  };
}

// --------------- Meter info (combined) ---------------

export async function getMeterInfo(cfg: OctopusConfig) {
  const region = await getGspRegion(cfg);
  const current = await getCurrentTariffs(cfg);
  return { gspRegion: region, currentTariff: current };
}
// --------------- Year-over-year actual cost ---------------

export interface YoYPoint {
  /** Current-period date (YYYY-MM-DD) */
  date: string;
  /** Same day one year earlier */
  prevDate: string;
  /** Total daily cost incl. standing charge (£) */
  elCur: number | null;
  elPrev: number | null;
  gasCur: number | null;
  gasPrev: number | null;
  /** Standing-charge part of the above (£) */
  elCurSc: number;
  elPrevSc: number;
  gasCurSc: number;
  gasPrevSc: number;
}

type RateSpan = { from: number; to: number; value: number };

async function fetchPaged<T>(url: string, apiKey: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const r: Response = await fetch(next, { headers: { Authorization: authHeader(apiKey) } });
    if (!r.ok) break;
    const body = await r.json();
    out.push(...(body.results ?? []));
    next = body.next ?? null;
  }
  return out;
}

const rateAt = (spans: RateSpan[], t: number) =>
  spans.find((s) => t >= s.from && t < s.to)?.value ?? null;

const shiftYear = (day: string, years: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
};

/**
 * Actual daily cost (£, inc VAT) per fuel for [from, to] using the tariff(s) the
 * account was on at the time. Days without consumption data are omitted.
 */
async function dailyActualCost(
  cfg: OctopusConfig,
  fuel: "electricity" | "gas",
  fromDay: string,
  toDay: string
): Promise<Record<string, { cost: number; sc: number }>> {
  const isEl = fuel === "electricity";
  const id = isEl ? cfg.elMpan : cfg.gasMprn;
  const sn = isEl ? cfg.elSn : cfg.gasSn;
  const periodFrom = `${fromDay}T00:00:00Z`;
  const periodTo = `${shiftYear(toDay, 0)}T23:59:59Z`;

  const [usage, acctRes] = await Promise.all([
    fetchPaged<{ consumption: number; interval_start: string }>(
      `${BASE}/${isEl ? "electricity" : "gas"}-meter-points/${id}/meters/${sn}/consumption/?page_size=25000&order_by=period&period_from=${periodFrom}&period_to=${periodTo}`,
      cfg.apiKey
    ),
    fetch(`${BASE}/accounts/${cfg.accountNumber}/`, { headers: { Authorization: authHeader(cfg.apiKey) } }),
  ]);
  if (!usage.length || !acctRes.ok) return {};
  const acct = await acctRes.json();

  type Agr = { tariff_code: string; valid_from: string; valid_to: string | null };
  const agreements: Agr[] = [];
  for (const p of acct.properties ?? []) {
    for (const mp of p[isEl ? "electricity_meter_points" : "gas_meter_points"] ?? []) {
      if ((mp.mpan ?? mp.mprn) === id) agreements.push(...(mp.agreements ?? []));
    }
  }

  const unit: RateSpan[] = [];
  const standing: RateSpan[] = [];
  const t0 = new Date(periodFrom).getTime();
  const t1 = new Date(periodTo).getTime();
  await Promise.all(
    agreements.map(async (a) => {
      const aFrom = new Date(a.valid_from).getTime();
      const aTo = a.valid_to ? new Date(a.valid_to).getTime() : Infinity;
      if (aTo <= t0 || aFrom >= t1) return;
      const from = new Date(Math.max(aFrom, t0)).toISOString();
      const to = new Date(Math.min(aTo, t1)).toISOString();
      const product = a.tariff_code.replace(/^[EG]-\dR-(.+)-[A-Z]$/, "$1");
      const base = `${BASE}/products/${product}/${isEl ? "electricity" : "gas"}-tariffs/${a.tariff_code}`;
      const q = `?page_size=1500&period_from=${from}&period_to=${to}`;
      const [ur, sc] = await Promise.all([
        fetchPaged<{ valid_from: string; valid_to: string | null; value_inc_vat: number }>(`${base}/standard-unit-rates/${q}`, cfg.apiKey),
        fetchPaged<{ valid_from: string; valid_to: string | null; value_inc_vat: number }>(`${base}/standing-charges/${q}`, cfg.apiKey),
      ]);
      const clamp = (r: { valid_from: string; valid_to: string | null; value_inc_vat: number }): RateSpan => ({
        from: Math.max(new Date(r.valid_from).getTime(), aFrom),
        to: Math.min(r.valid_to ? new Date(r.valid_to).getTime() : Infinity, aTo),
        value: r.value_inc_vat,
      });
      unit.push(...ur.map(clamp));
      standing.push(...sc.map(clamp));
    })
  );

  const pence: Record<string, number> = {};
  for (const u of usage) {
    const day = u.interval_start.slice(0, 10);
    const rate = rateAt(unit, new Date(u.interval_start).getTime());
    if (rate == null) continue;
    pence[day] = (pence[day] ?? 0) + u.consumption * (isEl ? 1 : GAS_M3_TO_KWH) * rate;
  }
  const out: Record<string, { cost: number; sc: number }> = {};
  for (const [day, p] of Object.entries(pence)) {
    const sc = rateAt(standing, new Date(day + "T12:00:00Z").getTime()) ?? 0;
    out[day] = { cost: (p + sc) / 100, sc: sc / 100 };
  }
  return out;
}

export async function getYearOverYearCost(cfg: OctopusConfig, days: number): Promise<YoYPoint[]> {
  if (cfg.demo) return demoYearOverYear(days);
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const prevFrom = shiftYear(from, -1);
  const prevTo = shiftYear(today, -1);

  const [elCur, elPrev, gasCur, gasPrev] = await Promise.all([
    dailyActualCost(cfg, "electricity", from, today),
    dailyActualCost(cfg, "electricity", prevFrom, prevTo),
    dailyActualCost(cfg, "gas", from, today),
    dailyActualCost(cfg, "gas", prevFrom, prevTo),
  ]);

  const points: YoYPoint[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const prevDate = shiftYear(date, -1);
    points.push({
      date,
      prevDate,
      elCur: elCur[date]?.cost ?? null,
      elPrev: elPrev[prevDate]?.cost ?? null,
      gasCur: gasCur[date]?.cost ?? null,
      gasPrev: gasPrev[prevDate]?.cost ?? null,
      elCurSc: elCur[date]?.sc ?? 0,
      elPrevSc: elPrev[prevDate]?.sc ?? 0,
      gasCurSc: gasCur[date]?.sc ?? 0,
      gasPrevSc: gasPrev[prevDate]?.sc ?? 0,
    });
  }
  return points;
}

// --------------- Temperature (Open-Meteo, location from account postcode) ---------------

export interface TempPoint {
  date: string;
  prevDate: string;
  cur: number | null;
  prev: number | null;
}

async function getLatLon(cfg: OctopusConfig): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await fetch(`${BASE}/accounts/${cfg.accountNumber}/`, { headers: { Authorization: authHeader(cfg.apiKey) } });
    if (!r.ok) return null;
    const props = (await r.json()).properties ?? [];
    const active = props.find((p: { moved_out_at: string | null }) => !p.moved_out_at) ?? props[0];
    const postcode: string | undefined = active?.postcode;
    if (!postcode) return null;
    const g = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ""))}`);
    if (!g.ok) return null;
    const { latitude, longitude } = (await g.json()).result ?? {};
    return typeof latitude === "number" ? { lat: latitude, lon: longitude } : null;
  } catch {
    return null;
  }
}

async function dailyMeanTemp(url: string): Promise<Record<string, number>> {
  const r = await fetch(url);
  if (!r.ok) return {};
  const d = (await r.json()).daily;
  const out: Record<string, number> = {};
  (d?.time ?? []).forEach((t: string, i: number) => {
    const v = d.temperature_2m_mean?.[i];
    if (typeof v === "number") out[t] = v;
  });
  return out;
}

/** Mean daily temperature for the period and the same period last year. Null if location unavailable. */
export async function getYearOverYearTemps(cfg: OctopusConfig, days: number): Promise<TempPoint[] | null> {
  if (cfg.demo) return demoYearOverYearTemps(days);
  const loc = await getLatLon(cfg);
  if (!loc) return null;

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const prevFrom = shiftYear(from, -1);
  const prevTo = shiftYear(today, -1);
  const archiveEnd = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const q = `latitude=${loc.lat}&longitude=${loc.lon}&daily=temperature_2m_mean&timezone=Europe%2FLondon`;
  const archive = (s: string, e: string) =>
    dailyMeanTemp(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${s}&end_date=${e}`);

  const [curOld, curRecent, prev] = await Promise.all([
    from <= archiveEnd ? archive(from, archiveEnd) : Promise.resolve({}),
    dailyMeanTemp(`https://api.open-meteo.com/v1/forecast?${q}&past_days=8&forecast_days=1`),
    archive(prevFrom, prevTo),
  ]).catch(() => [{}, {}, {}] as Record<string, number>[]);
  const cur = { ...curRecent, ...curOld };

  const points: TempPoint[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const prevDate = shiftYear(date, -1);
    points.push({ date, prevDate, cur: cur[date] ?? null, prev: prev[prevDate] ?? null });
  }
  return points;
}
