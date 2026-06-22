# Octopus Dashboard

A personal energy dashboard for [Octopus Energy](https://octopus.energy) customers. Reads your consumption and tariff data directly from the Octopus API in the browser — no backend, no server, no data ever leaves your machine.

## Features

- **Electricity & Gas consumption** — area charts with total, daily average, peak day and max, across flexible date ranges
- **Current tariff** — unit rate, standing charge, tariff name and contract end date
- **What-If comparison** — see what you'd pay on Flexible, Agile, Cosy, Go and Fixed tariffs vs your current plan
- **Daily cost chart** — line chart comparing all tariff scenarios day by day
- **Date ranges** — 7d, 30d, 90d, 180d, 360d, MTD, QTD, YTD
- **Private by default** — credentials stored in `localStorage`, nothing sent to any server

## Quick Start

```bash
bun install
bun run dev
```

## Credentials

On first load a setup wizard walks you through:

1. **Account number** — found on [octopus.energy/dashboard](https://octopus.energy/dashboard)
2. **API key** — Personal details → Developer settings → API access → Regenerate
3. **Electricity** — MPAN and meter serial number from Personal details
4. **Gas** — MPRN and meter serial number from Personal details

Credentials are saved to `localStorage` and can be cleared at any time via the Settings button.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Recharts
- react-hook-form + Zod

## Deploy

```bash
bun run build   # outputs dist/
wksp deploy     # uploads to Cloudflare R2
```
