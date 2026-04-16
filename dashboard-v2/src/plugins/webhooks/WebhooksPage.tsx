import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Webhook, Trash2, RefreshCw, Plus } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getWebhookEvents,
  getWebhookSubscriptions,
  getWebhookStatus,
  deleteWebhookSubscription,
  createWebhookSubscription,
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
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { isWebhookFormValid } from "../../lib/form-validation";
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

const WEBHOOK_EVENT_TYPES = [
  "push",
  "commit",
  "dream",
  "action",
  "tick",
  "decision",
] as const;

export default function WebhooksPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: overviewData } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
  });

  const repos = (overviewData as any)?.repos ?? [];

  const createSubMut = useMutation({
    mutationFn: () =>
      createWebhookSubscription({
        data: { repo: selectedRepo, eventTypes: selectedEventTypes },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: vigilKeys.webhooks.subscriptions,
      });
      setCreateOpen(false);
      setSelectedRepo("");
      setSelectedEventTypes([]);
    },
    onError: (err: Error) => toast.error(`Failed to create subscription: ${err.message}`),
  });

  const resetCreateForm = () => {
    setSelectedRepo("");
    setSelectedEventTypes([]);
  };

  const toggleEventType = (et: string) => {
    setSelectedEventTypes((prev) =>
      prev.includes(et) ? prev.filter((e) => e !== et) : [...prev, et],
    );
  };

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
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Subscriptions
            </h4>
            <Badge variant="secondary" className="text-xs">
              {subscriptions.length}
            </Badge>
          </div>
          <Button size="xs" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3" />
            Add Subscription
          </Button>
        </div>

        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Subscription</DialogTitle>
              <DialogDescription>Subscribe a repository to webhook events.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Repository</Label>
                <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select repository" />
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
              <div className="space-y-2">
                <Label>Event Types</Label>
                <div className="flex flex-wrap gap-2">
                  {WEBHOOK_EVENT_TYPES.map((et) => (
                    <Button
                      key={et}
                      size="xs"
                      variant={selectedEventTypes.includes(et) ? "default" : "outline"}
                      onClick={() => toggleEventType(et)}
                    >
                      {et}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createSubMut.mutate()}
                disabled={
                  !isWebhookFormValid(selectedRepo, selectedEventTypes) ||
                  createSubMut.isPending
                }
              >
                {createSubMut.isPending ? "Creating..." : "Add Subscription"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
