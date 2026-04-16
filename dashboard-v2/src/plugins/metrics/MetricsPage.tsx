import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Download, Filter } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import { getMetrics } from "../../server/functions";
import {
  VIGIL_CHART_COLORS,
  vigilTooltipStyle,
  vigilAxisProps,
} from "../../components/vigil/metrics-chart";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";
import type { MetricsData } from "../../types/api";

export const RANGE_MS: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

const RANGE_OPTIONS = ["1h", "6h", "24h", "7d", "30d"] as const;

export function metricsToCSV(
  data: { time: string; SILENT: number; OBSERVE: number; NOTIFY: number; ACT: number }[]
): string {
  const header = "time,SILENT,OBSERVE,NOTIFY,ACT";
  const rows = data.map(
    (d) => `${d.time},${d.SILENT},${d.OBSERVE},${d.NOTIFY},${d.ACT}`
  );
  return [header, ...rows].join("\n");
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MetricsPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const [range, setRange] = useState<string>("24h");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...vigilKeys.metrics, range],
    queryFn: () => getMetrics({ from: Date.now() - RANGE_MS[range], to: Date.now() }),
    refetchInterval: 30_000,
  });

  const metrics = data as MetricsData | undefined;

  const handleExportCSV = () => {
    if (!metrics?.decisions?.series) return;
    const csv = metricsToCSV(metrics.decisions.series);
    const date = new Date().toISOString().split("T")[0];
    downloadCSV(csv, `vigil-metrics-${range}-${date}.csv`);
    toast("Metrics exported as CSV");
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading metrics...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load data: {error?.message}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No metrics available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="size-4 text-muted-foreground" />
        {RANGE_OPTIONS.map((r) => (
          <Button
            key={r}
            variant={r === range ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(r)}
          >
            {r}
          </Button>
        ))}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!metrics?.decisions?.series?.length}
          >
            <Download className="size-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent>
            <div className="text-xs text-muted-foreground">Total Ticks</div>
            <div className="text-2xl font-bold">{metrics.ticks.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-xs text-muted-foreground">Avg Latency</div>
            <div className="text-2xl font-bold">{metrics.latency.avg}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-xs text-muted-foreground">Total Tokens</div>
            <div className="text-2xl font-bold">{metrics.tokens.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-xs text-muted-foreground">Cost Estimate</div>
            <div className="text-2xl font-bold">
              {metrics.tokens.costEstimate}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Decision Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={metrics.decisions.series}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={VIGIL_CHART_COLORS.grid}
              />
              <XAxis dataKey="time" {...vigilAxisProps} />
              <YAxis {...vigilAxisProps} />
              <Tooltip {...vigilTooltipStyle} />
              <Bar
                dataKey="SILENT"
                stackId="a"
                fill={VIGIL_CHART_COLORS.SILENT}
              />
              <Bar
                dataKey="OBSERVE"
                stackId="a"
                fill={VIGIL_CHART_COLORS.OBSERVE}
              />
              <Bar
                dataKey="NOTIFY"
                stackId="a"
                fill={VIGIL_CHART_COLORS.NOTIFY}
              />
              <Bar
                dataKey="ACT"
                stackId="a"
                fill={VIGIL_CHART_COLORS.ACT}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tick Latency</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metrics.latency.series}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={VIGIL_CHART_COLORS.grid}
              />
              <XAxis dataKey="tick" {...vigilAxisProps} />
              <YAxis {...vigilAxisProps} />
              <Tooltip {...vigilTooltipStyle} />
              <ReferenceLine
                y={metrics.latency.p95}
                stroke={VIGIL_CHART_COLORS.error}
                strokeDasharray="3 3"
                label="p95"
              />
              <Line
                type="monotone"
                dataKey="ms"
                stroke={VIGIL_CHART_COLORS.primary}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tick Timing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <span>Configured: {metrics.tickTiming.configured}s</span>
            <span>Current: {metrics.tickTiming.adaptiveCurrent}s</span>
            <span>Recent activity: {metrics.tickTiming.recentActivity}</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={metrics.tickTiming.series}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={VIGIL_CHART_COLORS.grid}
              />
              <XAxis dataKey="time" {...vigilAxisProps} />
              <YAxis {...vigilAxisProps} />
              <Tooltip {...vigilTooltipStyle} />
              <Bar
                dataKey="count"
                fill={VIGIL_CHART_COLORS.secondary}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
