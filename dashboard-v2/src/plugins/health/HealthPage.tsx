import { useQuery } from "@tanstack/react-query";
import { HeartPulse, Server, Database, AlertTriangle } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getHealth } from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import type { WidgetProps } from "../../types/plugin";

interface DbSize {
  name: string;
  size: number;
}

interface ErrorCount {
  type: string;
  count: number;
}

interface UptimeSegment {
  start: number;
  end: number;
  status: "up" | "down" | "degraded";
}

interface HealthData {
  process: {
    runtime: string;
    pid: number;
    uptime: number;
    heap: number;
    rss: number;
    external: number;
  };
  databases: Record<string, number>;
  errors: {
    total: number;
    details: Record<string, any>;
  };
  uptimeTimeline: Array<{ start: number; end: number; state: string }>;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const SEGMENT_COLORS: Record<string, string> = {
  up: "bg-green-500",
  down: "bg-red-500",
  degraded: "bg-amber-500",
};

export default function HealthPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.health,
    queryFn: () => getHealth(),
    refetchInterval: 10000,
  });

  const health = data as HealthData | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HeartPulse className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Health</h3>
        {health && (
          <Badge variant="secondary" className="text-xs font-mono">
            PID {health.process.pid}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load health: {error?.message}
        </div>
      )}

      {health && (
        <>
          {/* Process Panel */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Process
            </h4>
            <Card>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Runtime
                    </div>
                    <div className="flex items-center gap-2">
                      <Server className="size-3 text-muted-foreground" />
                      <span className="text-sm font-mono">
                        {health.process.runtime}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">PID</div>
                    <div className="text-sm font-mono">
                      {health.process.pid}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Uptime
                    </div>
                    <div className="text-sm font-mono">
                      {formatUptime(health.process.uptime)}
                    </div>
                  </div>
                </div>

                {/* Memory Bars */}
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Heap</span>
                      <span className="font-mono">
                        {formatBytes(health.process.heap)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-vigil transition-all"
                        style={{
                          width: `${Math.min(100, health.process.rss > 0 ? (health.process.heap / health.process.rss) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">RSS</span>
                      <span className="font-mono">
                        {formatBytes(health.process.rss)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Database Sizes */}
          {health.databases && Object.keys(health.databases).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Databases
              </h4>
              <Card>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(health.databases).map(([name, size]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Database className="size-3 text-muted-foreground" />
                          <span className="text-sm">{name}</span>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatBytes(size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Error Counts */}
          {health.errors && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Errors
              </h4>
              <Card>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="size-3 text-red-400" />
                    <span className="text-sm">Total errors</span>
                    <Badge variant="outline" className="text-xs text-red-400">
                      {health.errors.total}
                    </Badge>
                  </div>
                  {health.errors.details && Object.keys(health.errors.details).length > 0 && (
                    <div className="space-y-1 mt-2">
                      {Object.entries(health.errors.details)
                        .filter(([k]) => k.startsWith("errors."))
                        .map(([key, val]: [string, any]) => (
                          <div key={key} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-mono">{key}</span>
                            <span className="font-mono">{val.count ?? 0}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Uptime Timeline */}
          {health.uptimeTimeline && health.uptimeTimeline.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Uptime Timeline
              </h4>
              <Card>
                <CardContent>
                  <div className="flex h-6 rounded overflow-hidden gap-px">
                    {health.uptimeTimeline.map((seg, i) => {
                      const first = health.uptimeTimeline[0];
                      const last = health.uptimeTimeline[health.uptimeTimeline.length - 1];
                      const totalSpan = last.end - first.start;
                      const segSpan = seg.end - seg.start;
                      const pct = totalSpan > 0 ? (segSpan / totalSpan) * 100 : 100;
                      const stateColor = seg.state === "running" ? "bg-green-500" : seg.state === "sleeping" ? "bg-amber-500" : "bg-red-500";
                      return (
                        <div
                          key={`${seg.start}-${i}`}
                          className={`${stateColor} transition-all`}
                          style={{ width: `${Math.max(pct, 0.5)}%` }}
                          title={`${seg.state} (${formatUptime((seg.end - seg.start) / 1000)})`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    {[
                      { state: "running", color: "bg-green-500" },
                      { state: "sleeping", color: "bg-amber-500" },
                      { state: "down", color: "bg-red-500" },
                    ].map(({ state, color }) => (
                      <div
                        key={state}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        <div className={`size-2 rounded-full ${color}`} />
                        <span>{state}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
