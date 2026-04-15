import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vigilKeys } from "../../lib/query-keys";
import { getActions, approveAction, rejectAction } from "../../server/functions";
import { ActionApproval } from "../../components/vigil/action-approval";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import type { WidgetProps } from "../../types/plugin";
import type { ActionsData } from "../../types/api";

export default function ActionsPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.actions.all,
    queryFn: () => getActions({ data: {} }),
  });

  const actionsData = data as ActionsData | undefined;
  const pending = actionsData?.pending ?? [];
  const actions = actionsData?.actions ?? [];
  const stats = actionsData?.stats ?? {
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
    pending: 0,
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveAction({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.all }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectAction({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.all }),
  });

  const history = actions.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">Actions</h3>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            {stats.pending} pending
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {stats.approved} approved
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {stats.executed} executed
          </Badge>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Pending Approval
          </h4>
          {pending.map((action) => (
            <ActionApproval
              key={action.id}
              action={action}
              onApprove={(id) => approve.mutate(id)}
              onReject={(id) => reject.mutate(id)}
            />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            History
          </h4>
          {history.map((action) => (
            <ActionApproval key={action.id} action={action} />
          ))}
        </div>
      )}

      {!isLoading && actions.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No actions recorded.
        </div>
      )}
    </div>
  );
}
