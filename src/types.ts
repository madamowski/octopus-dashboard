export interface OctopusConfig {
  accountNumber: string;
  apiKey: string;
  elMpan: string;
  elSn: string;
  gasMprn: string;
  gasSn: string;
  /** True for the built-in demo account (fake data, no API calls). */
  demo?: boolean;
}

export interface DailyConsumption {
  date: string;
  consumption_kwh: number;
  /** Cumulative register reading on that day (if Octopus has one). */
  reading?: number | null;
  /** True when `reading` is derived from the nearest real reading plus daily usage. */
  readingEstimated?: boolean;
}

export interface TariffRates {
  unit_rate_p: number;
  standing_charge_p: number;
}

export interface Scenario {
  key: string;
  name: string;
  total_cost_gbp: number;
  electricity: TariffRates | null;
  gas: TariffRates | null;
  elTariffCode?: string | null;
  gasTariffCode?: string | null;
  validTo?: string | null;
}

export interface CostAnalysisResponse {
  scenarios: Scenario[];
  daily_whatif: Record<string, number | string>[];
  current_key: string;
}

export interface ConsumptionResponse {
  electricity: DailyConsumption[];
  gas: DailyConsumption[];
}

export interface MeterInfo {
  gspRegion: string;
  currentTariff: {
    electricity?: { tariff_code: string; product_code: string };
    gas?: { tariff_code: string; product_code: string };
  };
}

export interface TariffEntry {
  key: string;
  name: string;
  elCode: string | null;
  elProduct: string;
  gasCode: string | null;
  gasProduct: string;
}

export interface RateResult extends TariffEntry {
  elRates: TariffRates | null;
  gasRates: TariffRates | null;
}
