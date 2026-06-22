import type { OctopusConfig } from "@/types";

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