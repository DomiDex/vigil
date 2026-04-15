import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getTasks,
  activateTask,
  completeTask,
  failTask,
  cancelTask,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
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
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.tasks,
    queryFn: () => getTasks({ data: {} }),
  });

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
      </div>

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
