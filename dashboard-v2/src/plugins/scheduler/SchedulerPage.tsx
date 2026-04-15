import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getScheduler,
  deleteSchedule,
  triggerSchedule,
} from "../../server/functions";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";
import type { SchedulerData } from "../../types/api";

export function formatCountdown(ms: number | null): string {
  if (ms === null) return "N/A";
  if (ms <= 0) return "Now";
  if (ms >= 3600000) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export default function SchedulerPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.scheduler,
    queryFn: () => getScheduler(),
  });

  const schedulerData = data as SchedulerData | undefined;
  const entries = schedulerData?.entries ?? [];
  const history = schedulerData?.history ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSchedule({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.scheduler }),
  });

  const triggerMut = useMutation({
    mutationFn: (id: string) => triggerSchedule({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.scheduler }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">Scheduler</h3>
        <Badge variant="secondary" className="text-xs">
          {entries.length} schedules
        </Badge>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="size-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{entry.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{entry.cron}</span>
                    <span>{entry.action}</span>
                    {entry.repo && <span>({entry.repo})</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">
                  {formatCountdown(entry.msToNext)}
                </Badge>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => triggerMut.mutate(entry.id)}
                  disabled={triggerMut.isPending}
                >
                  <Play className="size-3" />
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => deleteMut.mutate(entry.id)}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Run History
          </h4>
          <div className="space-y-2">
            {history.map((entry, i) => (
              <Card key={`${entry.startedAt}-${i}`}>
                <CardContent className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {entry.status === "ok" ? (
                      <CheckCircle className="size-4 text-green-500" />
                    ) : (
                      <AlertCircle className="size-4 text-red-500" />
                    )}
                    <span>{entry.scheduleName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{entry.duration}ms</span>
                    {entry.error && (
                      <span className="text-red-400">{entry.error}</span>
                    )}
                    <span>
                      {new Date(entry.startedAt).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No schedules configured.
        </div>
      )}
    </div>
  );
}
