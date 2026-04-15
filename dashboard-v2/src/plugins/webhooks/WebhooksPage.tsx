import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Webhook, Trash2, RefreshCw } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getWebhookEvents,
  getWebhookSubscriptions,
  getWebhookStatus,
  deleteWebhookSubscription,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";

interface WebhookStatus {
  running: boolean;
  port: number;
  eventsReceived: number;
  errors: number;
  signatureFailures?: number;
  lastEventAt?: number;
}

interface WebhookSubscription {
  id: string;
  repo: string;
  eventTypes: string[];
  expiry?: number;
}

interface WebhookEvent {
  id?: string;
  type: string;
  repo?: string;
  status?: string;
  receivedAt?: string;
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
  const subscriptions = Array.isArray(subsData) ? (subsData as WebhookSubscription[]) : [];
  const events = Array.isArray(eventsData) ? (eventsData as WebhookEvent[]) : [];

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
                <div className="text-sm font-mono">{status.port || "N/A"}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Events Received</div>
                <div className="text-sm font-mono">{status.eventsReceived ?? 0}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Errors</div>
                <div className="text-sm font-mono">{status.errors ?? 0}</div>
              </div>
              {status.signatureFailures !== undefined && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Sig Failures</div>
                  <div className="text-sm font-mono">{status.signatureFailures}</div>
                </div>
              )}
            </div>
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
                    {sub.eventTypes?.map((et) => (
                      <Badge
                        key={et}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {et}
                      </Badge>
                    ))}
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
            {events.map((evt, i) => (
              <Card key={evt.id ?? i}>
                <CardContent className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-3 text-muted-foreground" />
                    <span className="font-medium">{evt.type}</span>
                    {evt.repo && (
                      <span className="text-muted-foreground">{evt.repo}</span>
                    )}
                  </div>
                  {evt.status && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${evt.status === "ok" ? "text-green-400" : "text-red-400"}`}
                    >
                      {evt.status}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
