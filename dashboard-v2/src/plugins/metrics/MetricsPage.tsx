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
import { BarChart3 } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getMetrics } from "../../server/functions";
import {
  VIGIL_CHART_COLORS,
  vigilTooltipStyle,
  vigilAxisProps,
} from "../../components/vigil/metrics-chart";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import type { WidgetProps } from "../../types/plugin";
import type { MetricsData } from "../../types/api";

export default function MetricsPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.metrics,
    queryFn: () => getMetrics(),
    refetchInterval: 30_000,
  });

  const metrics = data as MetricsData | undefined;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading metrics...</div>;
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
