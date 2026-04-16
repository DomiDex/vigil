import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getTasks,
  activateTask,
  completeTask,
  failTask,
  cancelTask,
  createTask,
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
      return ["complete", "fail"];
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

export function sortTasksWithChildren(tasks: any[]): any[] {
  const parentIds = new Set(tasks.filter((t) => !t.parentId).map((t) => t.id));
  const parents = tasks.filter((t) => !t.parentId);
  const children = tasks.filter((t) => t.parentId);

  const result: any[] = [];
  for (const parent of parents) {
    result.push(parent);
    const kids = children.filter((c) => c.parentId === parent.id);
    result.push(...kids);
  }

  // Add orphan children (parentId not in parents list)
  const orphans = children.filter((c) => !parentIds.has(c.parentId));
  result.push(...orphans);

  return result;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  waiting: "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  failed: "bg-error/10 text-error",
  cancelled: "bg-muted text-muted-foreground",
};

export default function TasksPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRepo, setNewRepo] = useState("");
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
  const completionRate = tasksData?.completionRate ?? 0;

  const sorted = sortTasksWithChildren(tasks);
  const filtered = statusFilter
    ? sorted.filter((t) => t.status === statusFilter)
    : sorted;

  const activate = useMutation({
    mutationFn: (id: string) => activateTask({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vigilKeys.tasks }),
  });

  const complete = useMutation({
    mutationFn: (id: string) => completeTask({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vigilKeys.tasks }),
  });

  const fail = useMutation({
    mutationFn: (id: string) => failTask({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vigilKeys.tasks }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelTask({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vigilKeys.tasks }),
  });

  const handleAction = (action: string, id: string) => {
    switch (action) {
      case "activate":
        activate.mutate(id);
        break;
      case "complete":
        complete.mutate(id);
        break;
      case "fail":
        fail.mutate(id);
        break;
      case "cancel":
        cancel.mutate(id);
        break;
    }
  };

  const allCount = Object.values(counts).reduce(
    (a: number, b: number) => a + b,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Tasks</h3>
          <span className="text-xs text-muted-foreground">
            {completionRate}% complete
          </span>
        </div>
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
              disabled={!isTaskFormValid(newTitle) || createMut.isPending}
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
          const isChild = !!task.parentId;

          return (
            <Card key={task.id} className={cn(isChild && "ml-6")}>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckSquare className="size-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">{task.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {task.repo && <span>{task.repo}</span>}
                      {task.updatedRelative && (
                        <span>{task.updatedRelative}</span>
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
    </div>
  );
}
