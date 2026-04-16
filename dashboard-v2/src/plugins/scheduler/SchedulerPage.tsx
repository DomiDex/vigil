import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Trash2, AlertCircle, CheckCircle, Plus } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getScheduler,
  deleteSchedule,
  triggerSchedule,
  createSchedule,
  getOverview,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { isSchedulerFormValid } from "../../lib/form-validation";
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

const CRON_PRESETS = [
  { label: "Every 5m", value: "*/5 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6h", value: "0 */6 * * *" },
  { label: "Daily midnight", value: "0 0 * * *" },
  { label: "Weekly Mon", value: "0 0 * * 1" },
] as const;

const SCHEDULER_ACTIONS = ["dream", "tick", "consolidate", "backup"] as const;

export default function SchedulerPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCron, setNewCron] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const queryClient = useQueryClient();

  const { data: overviewData } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
  });

  const repos = (overviewData as any)?.repos ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      createSchedule({
        data: {
          name: newName,
          cron: newCron,
          action: newAction,
          ...(newRepo && { repo: newRepo }),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.scheduler });
      setCreateOpen(false);
      setNewName("");
      setNewCron("");
      setNewAction("");
      setNewRepo("");
    },
  });

  const { data, isLoading, isError, error } = useQuery({
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Scheduler</h3>
          <Badge variant="secondary" className="text-xs">
            {entries.length} schedules
          </Badge>
        </div>
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3" />
          New Schedule
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Name</Label>
              <Input
                id="schedule-name"
                placeholder="Schedule name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-cron">Cron Expression</Label>
              <Input
                id="schedule-cron"
                placeholder="*/5 * * * *"
                value={newCron}
                onChange={(e) => setNewCron(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {CRON_PRESETS.map((preset) => (
                  <Button
                    key={preset.value}
                    size="xs"
                    variant={newCron === preset.value ? "default" : "outline"}
                    onClick={() => setNewCron(preset.value)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={newAction} onValueChange={setNewAction}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULER_ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Repository</Label>
              <Select value={newRepo} onValueChange={setNewRepo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select repo (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {repos.map((r: any) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                !isSchedulerFormValid(newName, newCron, newAction) ||
                createMut.isPending
              }
            >
              {createMut.isPending ? "Creating..." : "Create Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load data: {error?.message}
        </div>
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
