import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Webhook, Plus, Trash2, RefreshCw } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getWebhookEvents,
  getWebhookSubscriptions,
  getWebhookStatus,
  createWebhookSubscription,
  deleteWebhookSubscription,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";

interface WebhookEvent {
  id: string;
  type: string;
  repo: string;
  payload: string;
  receivedAt: string;
  status: "ok" | "error";
}

interface WebhookSubscription {
  id: string;
  repo: string;
  eventTypes: string[];
  url: string;
  createdAt: string;
}

interface WebhookStatus {
  running: boolean;
  port: number;
  totalEvents: number;
  uptime: number;
  healthStats: {
    successRate: number;
    avgLatency: number;
    errorsLast24h: number;
  };
}

export default function WebhooksPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
    error: statusErr,
  } = useQuery({
    queryKey: vigilKeys.webhooks.status,
    queryFn: () => getWebhookStatus(),
    refetchInterval: 10000,
  });

  const { data: subsData } = useQuery({
    queryKey: vigilKeys.webhooks.subscriptions,
    queryFn: () => getWebhookSubscriptions(),
  });

  const { data: eventsData } = useQuery({
    queryKey: vigilKeys.webhooks.events,
    queryFn: () => getWebhookEvents(),
  });

  const status = statusData as WebhookStatus | undefined;
  const subscriptions = (subsData as WebhookSubscription[] | undefined) ?? [];
  const events = (eventsData as WebhookEvent[] | undefined) ?? [];

  const createMut = useMutation({
    mutationFn: (payload: {
      repo: string;
      eventTypes: string[];
      url: string;
    }) => createWebhookSubscription({ data: payload }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: vigilKeys.webhooks.subscriptions,
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWebhookSubscription({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: vigilKeys.webhooks.subscriptions,
      }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Webhook className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Webhooks</h3>
        {status && (
          <Badge
            variant={status.running ? "default" : "outline"}
            className={`text-xs ${status.running ? "text-green-400" : "text-red-400"}`}
          >
            {status.running ? "running" : "stopped"}
          </Badge>
        )}
      </div>

      {statusLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {statusError && (
        <div className="text-sm text-destructive p-4">
          Failed to load webhooks: {statusErr?.message}
        </div>
      )}

      {/* Status Bar */}
      {status && (
        <Card>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Port</div>
                <div className="text-sm font-mono">{status.port}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Total Events
                </div>
                <div className="text-sm font-mono">{status.totalEvents}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Success Rate
                </div>
                <div className="text-sm font-mono">
                  {(status.healthStats.successRate * 100).toFixed(1)}%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Avg Latency
                </div>
                <div className="text-sm font-mono">
                  {status.healthStats.avgLatency}ms
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Stats */}
      {status && status.healthStats.errorsLast24h > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Errors (last 24h)
            </span>
            <Badge variant="outline" className="text-xs text-red-400">
              {status.healthStats.errorsLast24h}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Subscriptions
          </h4>
          <Badge variant="secondary" className="text-xs">
            {subscriptions.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardContent className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{sub.repo}</span>
                    {sub.eventTypes.map((et) => (
                      <Badge
                        key={et}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {et}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    {sub.url}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => deleteMut.mutate(sub.id)}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="size-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {subscriptions.length === 0 && !statusLoading && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No subscriptions configured.
            </div>
          )}
        </div>
      </div>

      {/* Event Log */}
      {events.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Recent Events
          </h4>
          <div className="space-y-2">
            {events.map((evt) => (
              <Card key={evt.id}>
                <CardContent className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-3 text-muted-foreground" />
                    <span className="font-medium">{evt.type}</span>
                    <span className="text-muted-foreground">{evt.repo}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${evt.status === "ok" ? "text-green-400" : "text-red-400"}`}
                    >
                      {evt.status}
                    </Badge>
                    <span>
                      {new Date(evt.receivedAt).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
