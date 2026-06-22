import type {
  OctopusConfig,
  ConsumptionResponse,
  CostAnalysisResponse,
  DailyConsumption,
  Scenario,
  RateResult,
  TariffRates,
} from "@/types";

const BASE = "https://api.octopus.energy/v1";

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

// --------------- Consumption ---------------

export async function getConsumption(
  cfg: OctopusConfig,
  days = 30
): Promise<ConsumptionResponse> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

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

  return { electricity, gas };
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