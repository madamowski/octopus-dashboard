import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PiggyBank } from "lucide-react";
import type { Scenario } from "@/types";

interface Props {
  scenarios: Scenario[];
  currentKey: string;
  days: number;
  loading: boolean;
  error: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function TariffInfoCard({ scenarios, currentKey, days, loading, error }: Props) {
  const current = scenarios.find((s) => s.key === currentKey) ?? scenarios[0];

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-pink-400" />
          <CardTitle className="text-sm font-medium">Current Tariff</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !current ? (
          <p className="text-sm text-muted-foreground">No tariff data</p>
        ) : (
          <div className="space-y-3">
            {/* Tariff name + valid to */}
            <div>
              <p className="text-xs text-muted-foreground">Current tariff</p>
              <p className="text-sm font-medium text-foreground leading-tight">
                {current.name}
                {current.validTo && (
                  <span className="text-muted-foreground font-normal">
                    {" "}(until {formatDate(current.validTo)})
                  </span>
                )}
              </p>
            </div>

            {/* Rates side by side */}
            <div className="grid grid-cols-2 gap-4">
              {current.electricity && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium">Electricity</p>
                  <p className="text-base font-bold tabular-nums text-pink-400">
                    {current.electricity.unit_rate_p.toFixed(4)}p
                    <span className="text-xs font-normal text-muted-foreground"> /kWh</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    SC {current.electricity.standing_charge_p.toFixed(4)}p/day
                  </p>
                </div>
              )}
              {current.gas && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium">Gas</p>
                  <p className="text-base font-bold tabular-nums text-teal-400">
                    {current.gas.unit_rate_p.toFixed(4)}p
                    <span className="text-xs font-normal text-muted-foreground"> /kWh</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    SC {current.gas.standing_charge_p.toFixed(4)}p/day
                  </p>
                </div>
              )}
            </div>

            {/* Total cost */}
            <div className="pt-1 border-t border-border/50 flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums text-emerald-400">
                £{current.total_cost_gbp.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground">total · last {days} days</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
