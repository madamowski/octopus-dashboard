import type {
  OctopusConfig,
  ConsumptionResponse,
  CostAnalysisResponse,
  DailyConsumption,
  Scenario,
  TariffRates,
} from "@/types";
import type { YoYPoint, TempPoint } from "@/lib/octopus";

/** Fake account used by the "Try the demo" button. No network calls, no personal data. */
export const DEMO_CONFIG: OctopusConfig = {
  accountNumber: "A-DEMO0000",
  apiKey: "demo",
  elMpan: "0000000000000",
  elSn: "DEMO-EL",
  gasMprn: "0000000",
  gasSn: "DEMO-GAS",
  demo: true,
};

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Deterministic pseudo-random in [0,1) from a string. */
function rnd(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Winter = 1, summer = 0 */
function winter(date: string) {
  const d = new Date(date + "T00:00:00Z");
  const doy = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY;
  return (Math.cos(((doy - 15) / 365) * 2 * Math.PI) + 1) / 2;
}

function kwh(fuel: "electricity" | "gas", date: string, yearsBack = 0) {
  const w = winter(date);
  const noise = 0.8 + rnd(fuel + date + yearsBack) * 0.4;
  const wk = [0, 6].includes(new Date(date + "T00:00:00Z").getUTCDay()) ? 1.12 : 1;
  const yr = yearsBack ? 1.12 : 1; // last year was a bit more expensive
  return fuel === "electricity"
    ? (7 + 5 * w) * noise * wk * yr
    : (4 + 52 * w * w) * noise * yr;
}

function series(fuel: "electricity" | "gas", from: string, to: string, yearsBack = 0): DailyConsumption[] {
  const out: DailyConsumption[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
    const date = iso(t);
    out.push({ date, consumption_kwh: Math.round(kwh(fuel, date, yearsBack) * 1000) / 1000 });
  }
  return out;
}

export function demoConsumption(days: number): ConsumptionResponse {
  const to = iso(Date.now() - DAY); // today is never complete
  const from = iso(Date.now() - days * DAY);
  const base = { electricity: 18250.4, gas: 9120.7 };

  const withReadings = (fuel: "electricity" | "gas"): DailyConsumption[] => {
    const rows = series(fuel, from, to);
    // register at start of each day = base + usage since the beginning of the demo range
    let reg = base[fuel];
    return rows.map((r, i) => {
      const out = {
        ...r,
        reading: Math.round(reg * 100) / 100,
        readingEstimated: i % 7 !== 0,
      };
      reg += r.consumption_kwh;
      return out;
    });
  };
  return { electricity: withReadings("electricity"), gas: withReadings("gas") };
}

const TARIFFS: { key: string; name: string; el: TariffRates; gas: TariffRates | null }[] = [
  { key: "__current__", name: "Flexible Octopus", el: { unit_rate_p: 27.4, standing_charge_p: 46.4 }, gas: { unit_rate_p: 6.9, standing_charge_p: 29.8 } },
  { key: "VAR-22-11-01", name: "Flexible Octopus (variable)", el: { unit_rate_p: 27.4, standing_charge_p: 46.4 }, gas: { unit_rate_p: 6.9, standing_charge_p: 29.8 } },
  { key: "OE-FIX-12M-26-06-18", name: "Octopus 12M Fixed (Jun 26)", el: { unit_rate_p: 25.1, standing_charge_p: 47.1 }, gas: { unit_rate_p: 6.3, standing_charge_p: 30.2 } },
  { key: "AGILE-24-10-01", name: "Agile Octopus", el: { unit_rate_p: 23.6, standing_charge_p: 45.9 }, gas: null },
  { key: "COSY-22-12-08", name: "Cosy Octopus", el: { unit_rate_p: 24.8, standing_charge_p: 46.0 }, gas: null },
  { key: "GO-FIX-12M-26-06-13", name: "Octopus Go 12M Fixed", el: { unit_rate_p: 22.9, standing_charge_p: 47.5 }, gas: null },
];

export function demoCostAnalysis(days: number): CostAnalysisResponse {
  const { electricity, gas } = demoConsumption(days);
  const dayCost = (t: (typeof TARIFFS)[number], date: string) => {
    const el = electricity.find((d) => d.date === date);
    const g = gas.find((d) => d.date === date);
    let c = 0;
    if (el) c += (el.consumption_kwh * t.el.unit_rate_p + t.el.standing_charge_p) / 100;
    if (g && t.gas) c += (g.consumption_kwh * t.gas.unit_rate_p + t.gas.standing_charge_p) / 100;
    return c;
  };
  const dates = electricity.map((d) => d.date);
  const scenarios: Scenario[] = TARIFFS.map((t) => ({
    key: t.key,
    name: t.name,
    total_cost_gbp: Math.round(dates.reduce((s, d) => s + dayCost(t, d), 0) * 100) / 100,
    electricity: t.el,
    gas: t.gas,
    elTariffCode: `E-1R-${t.key}-C`,
    gasTariffCode: t.gas ? `G-1R-${t.key}-C` : null,
    validTo: t.key === "__current__" ? null : null,
  }));
  const daily_whatif = dates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const t of TARIFFS) row[t.key] = Math.round(dayCost(t, date) * 100) / 100;
    return row;
  });
  // The duplicate "variable" entry is only needed for the current-tariff row; drop it from the lists.
  return {
    scenarios: scenarios.filter((s) => s.key !== "VAR-22-11-01"),
    daily_whatif,
    current_key: "__current__",
  };
}

export function demoYearOverYear(days: number): YoYPoint[] {
  const cur = TARIFFS[0];
  const shift = (d: string) => {
    const x = new Date(d + "T00:00:00Z");
    x.setUTCFullYear(x.getUTCFullYear() - 1);
    return x.toISOString().slice(0, 10);
  };
  const cost = (fuel: "electricity" | "gas", date: string, back: number) => {
    const r = fuel === "electricity" ? cur.el : cur.gas!;
    // last year's rates were ~9% higher
    const f = back ? 1.09 : 1;
    return ((kwh(fuel, date, back) * r.unit_rate_p + r.standing_charge_p) * f) / 100;
  };
  const out: YoYPoint[] = [];
  for (let t = Date.now() - days * DAY; iso(t) <= iso(Date.now()); t += DAY) {
    const date = iso(t);
    const prevDate = shift(date);
    out.push({
      date,
      prevDate,
      elCur: cost("electricity", date, 0),
      elPrev: cost("electricity", prevDate, 1),
      gasCur: cost("gas", date, 0),
      gasPrev: cost("gas", prevDate, 1),
      elCurSc: cur.el.standing_charge_p / 100,
      elPrevSc: (cur.el.standing_charge_p * 1.09) / 100,
      gasCurSc: cur.gas!.standing_charge_p / 100,
      gasPrevSc: (cur.gas!.standing_charge_p * 1.09) / 100,
      gasCurKwh: kwh("gas", date, 0),
      gasPrevKwh: kwh("gas", prevDate, 1),
    });
  }
  return out;
}

export function demoYearOverYearTemps(days: number): TempPoint[] {
  const temp = (date: string, back: number) =>
    Math.round((3 + 15 * (1 - winter(date)) + (rnd("t" + date + back) - 0.5) * 6 + (back ? 0.8 : 0)) * 10) / 10;
  const out: TempPoint[] = [];
  for (let t = Date.now() - days * DAY; iso(t) <= iso(Date.now()); t += DAY) {
    const date = iso(t);
    const x = new Date(date + "T00:00:00Z");
    x.setUTCFullYear(x.getUTCFullYear() - 1);
    const prevDate = x.toISOString().slice(0, 10);
    out.push({ date, prevDate, cur: temp(date, 0), prev: temp(prevDate, 1) });
  }
  return out;
}
