import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import type { Scenario } from "@/types";

interface Props {
  scenarios: Scenario[];
  currentKey: string;
  loading: boolean;
  error: string | null;
}

const COLORS = ["#ec4899", "#14b8a6", "#a78bfa", "#f87171", "#60a5fa", "#fb923c", "#34d399"];

export function WhatIfTotalCard({ scenarios, currentKey, loading, error }: Props) {
  const current = scenarios.find((s) => s.key === currentKey);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-400" />
          <CardTitle className="text-sm font-medium">What-If — Total Cost Comparison</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : scenarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {scenarios.map((s, i) => {
              const diff = current ? s.total_cost_gbp - current.total_cost_gbp : 0;
              const isCurrent = s.key === currentKey;
              const sign = diff > 0 ? "+" : "";
              return (
                <div key={s.key} className="flex items-start gap-2">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <div>
                    <p className="text-xs text-muted-foreground leading-tight">{s.name}</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      £{s.total_cost_gbp.toFixed(2)}
                      {isCurrent ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">(current)</span>
                      ) : (
                        <span className={`ml-1 text-xs font-normal ${diff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          ({sign}£{Math.abs(diff).toFixed(2)})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
