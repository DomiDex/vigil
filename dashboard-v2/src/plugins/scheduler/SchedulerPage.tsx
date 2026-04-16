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
import { Calendar } from "../../components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { toast } from "sonner";
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

type FrequencyType = "minutes" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";

const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const DAYS_OF_WEEK = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildCron(
  frequency: FrequencyType,
  interval: number,
  hour: number,
  minute: number,
  dayOfWeek: string,
  dayOfMonth: number,
  month: string,
): string {
  switch (frequency) {
    case "minutes":
      return `*/${interval} * * * *`;
    case "hourly":
      return `0 */${interval} * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    case "yearly":
      return `${minute} ${hour} ${dayOfMonth} ${month} *`;
  }
}

function describeCron(
  frequency: FrequencyType,
  interval: number,
  hour: number,
  minute: number,
  dayOfWeek: string,
  dayOfMonth: number,
  month: string,
): string {
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const dayLabel = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? dayOfWeek;
  const monthLabel = MONTH_NAMES[Number(month) - 1] ?? month;
  switch (frequency) {
    case "minutes":
      return `Every ${interval} minute${interval > 1 ? "s" : ""}`;
    case "hourly":
      return `Every ${interval} hour${interval > 1 ? "s" : ""}`;
    case "daily":
      return `Daily at ${time}`;
    case "weekly":
      return `Every ${dayLabel} at ${time}`;
    case "monthly":
      return `Monthly on the ${dayOfMonth}${ordinalSuffix(dayOfMonth)} at ${time}`;
    case "yearly":
      return `Every ${monthLabel} ${dayOfMonth}${ordinalSuffix(dayOfMonth)} at ${time}`;
  }
}

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

const SCHEDULER_ACTIONS = ["dream", "tick", "consolidate", "backup"] as const;

export default function SchedulerPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFrequency, setNewFrequency] = useState<FrequencyType>("daily");
  const [newInterval, setNewInterval] = useState(5);
  const [newHour, setNewHour] = useState(0);
  const [newMinute, setNewMinute] = useState(0);
  const [newDayOfWeek, setNewDayOfWeek] = useState("1");
  const [newCalendarDate, setNewCalendarDate] = useState<Date>(new Date());
  const [newAction, setNewAction] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const queryClient = useQueryClient();

  const { data: overviewData } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
  });

  const repos = (overviewData as any)?.repos ?? [];

  const calendarDay = newCalendarDate.getDate();
  const calendarMonth = String(newCalendarDate.getMonth() + 1);

  const generatedCron = buildCron(newFrequency, newInterval, newHour, newMinute, newDayOfWeek, calendarDay, calendarMonth);
  const cronDescription = describeCron(newFrequency, newInterval, newHour, newMinute, newDayOfWeek, calendarDay, calendarMonth);

  const createMut = useMutation({
    mutationFn: () =>
      createSchedule({
        data: {
          name: newName,
          cron: generatedCron,
          action: newAction,
          ...(newRepo && { repo: newRepo }),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.scheduler });
      setCreateOpen(false);
      resetCreateForm();
    },
    onError: (err: Error) => toast.error(`Failed to create schedule: ${err.message}`),
  });

  const resetCreateForm = () => {
    setNewName("");
    setNewFrequency("daily");
    setNewInterval(5);
    setNewHour(0);
    setNewMinute(0);
    setNewDayOfWeek("1");
    setNewCalendarDate(new Date());
    setNewAction("");
    setNewRepo("");
  };

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

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Schedule</DialogTitle>
            <DialogDescription>Create a recurring schedule with a cron expression.</DialogDescription>
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
              <Label>Frequency</Label>
              <div className="flex flex-wrap gap-1">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="xs"
                    variant={newFrequency === opt.value ? "default" : "outline"}
                    onClick={() => setNewFrequency(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {(newFrequency === "minutes" || newFrequency === "hourly") && (
              <div className="space-y-2">
                <Label htmlFor="schedule-interval">
                  Every {newInterval} {newFrequency === "minutes" ? "minute" : "hour"}{newInterval > 1 ? "s" : ""}
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    id="schedule-interval"
                    type="range"
                    min={newFrequency === "minutes" ? 1 : 1}
                    max={newFrequency === "minutes" ? 60 : 24}
                    value={newInterval}
                    onChange={(e) => setNewInterval(Number(e.target.value))}
                    className="flex-1 accent-vigil"
                  />
                  <span className="text-sm font-mono w-8 text-right">{newInterval}</span>
                </div>
              </div>
            )}

            {(newFrequency === "daily" || newFrequency === "weekly" || newFrequency === "monthly" || newFrequency === "yearly") && (
              <div className="space-y-2">
                <Label>Time</Label>
                <div className="flex items-center gap-2">
                  <Select value={String(newHour)} onValueChange={(v) => setNewHour(Number(v))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {String(i).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select value={String(newMinute)} onValueChange={(v) => setNewMinute(Number(v))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {String(m).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {(newFrequency === "monthly" || newFrequency === "yearly") && (
              <div className="space-y-2">
                <Label>
                  {newFrequency === "monthly" ? "Day of month" : "Date"}
                </Label>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={newCalendarDate}
                    onSelect={(date) => date && setNewCalendarDate(date)}
                    className="rounded-lg border"
                  />
                </div>
              </div>
            )}

            {newFrequency === "weekly" && (
              <div className="space-y-2">
                <Label>Day</Label>
                <div className="flex flex-wrap gap-1">
                  {DAYS_OF_WEEK.map((day) => (
                    <Button
                      key={day.value}
                      size="xs"
                      variant={newDayOfWeek === day.value ? "default" : "outline"}
                      onClick={() => setNewDayOfWeek(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {cronDescription} <span className="font-mono ml-1">({generatedCron})</span>
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
                !isSchedulerFormValid(newName, generatedCron, newAction) ||
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
