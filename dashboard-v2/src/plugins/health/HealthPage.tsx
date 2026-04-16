import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Server, Database, AlertTriangle, HardDrive, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import { getHealth, vacuumDatabase, pruneEvents } from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { formatBytes } from "../metrics/MetricsPage";
import type { WidgetProps } from "../../types/plugin";

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

function formatBytesLocal(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function HealthPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();
  const [pruneDays, setPruneDays] = useState(90);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.health,
    queryFn: () => getHealth(),
    refetchInterval: 10000,
  });

  const health = data as HealthData | undefined;

  const vacuumMutation = useMutation({
    mutationFn: vacuumDatabase,
    onSuccess: (data: any) => {
      toast(`Freed ${formatBytes(data.freedBytes ?? 0)}`);
      queryClient.invalidateQueries({ queryKey: vigilKeys.health });
    },
    onError: (err: Error) => {
      toast.error(`Vacuum failed: ${err.message}`);
    },
  });

  const pruneMutation = useMutation({
    mutationFn: pruneEvents,
    onSuccess: (data: any) => {
      toast(`Deleted ${data.deletedCount ?? 0} events`);
      queryClient.invalidateQueries({ queryKey: vigilKeys.health });
    },
    onError: (err: Error) => {
      toast.error(`Prune failed: ${err.message}`);
    },
  });

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
                        {formatBytesLocal(health.process.heap)}
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
                        {formatBytesLocal(health.process.rss)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-vigil transition-all"
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
                          {formatBytesLocal(size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Database Maintenance */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Database Maintenance
            </h4>
            <Card>
              <CardContent>
                <div className="space-y-4">
                  {/* Vacuum */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Vacuum Database</div>
                      <div className="text-xs text-muted-foreground">
                        Compact the database to reclaim disk space
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={vacuumMutation.isPending}
                        >
                          {vacuumMutation.isPending ? (
                            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <HardDrive className="size-3.5 mr-1.5" />
                          )}
                          Vacuum
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Vacuum Database</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will compact the database. It may take a moment.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => vacuumMutation.mutate()}>
                            Vacuum
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="border-t border-border" />

                  {/* Prune */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Prune Events</div>
                      <div className="text-xs text-muted-foreground">
                        Delete events older than a specified number of days
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={pruneDays}
                        onChange={(e) => setPruneDays(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pruneMutation.isPending || pruneDays < 1 || pruneDays > 365}
                          >
                            {pruneMutation.isPending ? (
                              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5 mr-1.5" />
                            )}
                            Prune Events
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Prune Events</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete events older than {pruneDays} days. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => pruneMutation.mutate({ data: { olderThanDays: pruneDays } })}
                            >
                              Delete Events
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

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
