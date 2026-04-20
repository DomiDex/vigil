import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Pencil, Plus, Clock } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getTasks,
  activateTask,
  completeTask,
  cancelTask,
  createTask,
  updateTask,
  getOverview,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/cn";
import { isTaskFormValid } from "../../lib/form-validation";
import type { WidgetProps } from "../../types/plugin";
import type { TasksData } from "../../types/api";

export function getTaskActions(status: string): string[] {
  switch (status) {
    case "pending":
      return ["activate", "cancel"];
    case "active":
      return ["complete", "cancel"];
    case "waiting":
      return ["activate", "cancel"];
    case "completed":
    case "failed":
    case "cancelled":
      return [];
    default:
      return [];
  }
}

interface WaitCondition {
  type: "event" | "task" | "schedule";
  eventType?: string;
  filter?: string;
  taskId?: string;
  cron?: string;
}

export function describeWaitCondition(wc: WaitCondition | null | undefined): string | null {
  if (!wc) return null;
  if (wc.type === "event" && wc.eventType) {
    return wc.filter ? `waiting on ${wc.eventType} (${wc.filter})` : `waiting on ${wc.eventType}`;
  }
  if (wc.type === "task" && wc.taskId) {
    return `waiting on task ${wc.taskId.slice(0, 8)}`;
  }
  if (wc.type === "schedule" && wc.cron) {
    return `waiting on schedule ${wc.cron}`;
  }
  return "waiting";
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  waiting: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  failed: "bg-error/10 text-error",
  cancelled: "bg-muted text-muted-foreground",
};

interface EditTarget {
  id: string;
  title: string;
  description: string;
  repo: string;
}

export default function TasksPage({ activeRepo: _activeRepo }: Partial<WidgetProps> = {}) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.tasks,
    queryFn: () => getTasks({ data: {} }),
  });

  const { data: overviewData } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
  });

  const repos = (overviewData as any)?.repos ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      createTask({
        data: {
          title: newTitle,
          ...(newDescription && { description: newDescription }),
          ...(newRepo && { repo: newRepo }),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
      setCreateOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewRepo("");
      toast.success("Task created");
    },
    onError: (err: Error) => toast.error(`Failed to create task: ${err.message}`),
  });

  const resetCreateForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewRepo("");
  };

  const tasksData = data as TasksData | undefined;
  const tasks = tasksData?.tasks ?? [];
  const counts = tasksData?.counts ?? {};

  const filtered = statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks;

  const activate = useMutation({
    mutationFn: (id: string) => activateTask({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
      toast.success("Task activated");
    },
    onError: (err: Error) => toast.error(`Failed to activate: ${err.message}`),
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeTask({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
      toast.success("Task completed");
    },
    onError: (err: Error) => toast.error(`Failed to complete: ${err.message}`),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelTask({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
      toast.success("Task cancelled");
    },
    onError: (err: Error) => toast.error(`Failed to cancel: ${err.message}`),
  });

  const update = useMutation({
    mutationFn: (payload: { id: string; title: string; description: string; repo: string }) =>
      updateTask({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.tasks });
      setEditTarget(null);
      toast.success("Task updated");
    },
    onError: (err: Error) => toast.error(`Failed to update task: ${err.message}`),
  });

  const handleAction = (action: string, id: string) => {
    switch (action) {
      case "activate":
        activate.mutate(id);
        break;
      case "complete":
        complete.mutate(id);
        break;
      case "cancel":
        cancel.mutate(id);
        break;
    }
  };

  const allCount = Object.values(counts).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Tasks</h3>
        <Button size="xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3" />
          New Task
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>Create a new task to track work.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                placeholder="Task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                placeholder="Optional description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                Repository <span className="text-destructive">*</span>
              </Label>
              <Select value={newRepo} onValueChange={setNewRepo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select repo" />
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
              disabled={!isTaskFormValid(newTitle) || !newRepo || createMut.isPending}
            >
              {createMut.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="xs"
          variant={statusFilter === null ? "default" : "secondary"}
          onClick={() => setStatusFilter(null)}
        >
          All ({allCount})
        </Button>
        {Object.entries(counts).map(([status, count]) => (
          <Button
            key={status}
            size="xs"
            variant={statusFilter === status ? "default" : "secondary"}
            onClick={() => setStatusFilter(status)}
          >
            {status} ({count})
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load data: {error?.message}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((task: any) => {
          const actions = getTaskActions(task.status);
          const waitLabel =
            task.status === "waiting" ? describeWaitCondition(task.waitCondition) : null;

          return (
            <Card key={task.id}>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckSquare className="size-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.repo && <span>{task.repo}</span>}
                      {task.updatedRelative && <span>{task.updatedRelative}</span>}
                      {waitLabel && (
                        <span className="flex items-center gap-1 text-warning">
                          <Clock className="size-3" />
                          {waitLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      "text-xs border-0",
                      STATUS_STYLES[task.status] ?? "",
                    )}
                  >
                    {task.status}
                  </Badge>
                  {actions.length > 0 && (
                    <Button
                      size="xs"
                      variant="secondary"
                      aria-label={`Edit ${task.title}`}
                      onClick={() =>
                        setEditTarget({
                          id: task.id,
                          title: task.title,
                          description: task.description ?? "",
                          repo: task.repo ?? "",
                        })
                      }
                    >
                      <Pencil className="size-3" />
                    </Button>
                  )}
                  {actions.map((action) => (
                    <Button
                      key={action}
                      size="xs"
                      variant="secondary"
                      onClick={() => handleAction(action, task.id)}
                    >
                      {action}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isLoading && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No tasks found.
        </div>
      )}

      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update the task details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTarget?.title ?? ""}
                onChange={(e) => setEditTarget((prev) => prev ? { ...prev, title: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editTarget?.description ?? ""}
                onChange={(e) => setEditTarget((prev) => prev ? { ...prev, description: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label>Repository</Label>
              <Select
                value={editTarget?.repo ?? ""}
                onValueChange={(v) =>
                  setEditTarget((prev) => (prev ? { ...prev, repo: v } : null))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select repo" />
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
              onClick={() =>
                update.mutate({
                  id: editTarget!.id,
                  title: editTarget!.title,
                  description: editTarget!.description,
                  repo: editTarget!.repo,
                })
              }
              disabled={update.isPending || !editTarget?.title || !editTarget?.repo}
            >
              {update.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
