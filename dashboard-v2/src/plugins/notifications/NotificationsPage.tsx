import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, Settings, Moon } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getNotifications,
  testNotification,
  updateNotificationRules,
} from "../../server/functions";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { toast } from "sonner";
import type { WidgetProps } from "../../types/plugin";

interface NotificationEntry {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  channel: string;
  sentAt: string;
  delivered: boolean;
}

interface NotificationConfig {
  enabled: boolean;
  severityThreshold: string;
  rateLimit: number;
  rateLimitWindow: number;
  channels: string[];
  quietHours?: { start: string; end: string };
}

interface NotificationsData {
  config: NotificationConfig;
  history: NotificationEntry[];
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-info",
  warning: "text-amber-400",
  error: "text-red-400",
  critical: "text-red-500",
};

function isWithinQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  const current = `${hh}:${mm}`;

  if (start <= end) {
    return current >= start && current < end;
  }
  // Wraps midnight (e.g., 22:00 - 07:00)
  return current >= start || current < end;
}

export default function NotificationsPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const {
    data: notifData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: vigilKeys.notifications,
    queryFn: () => getNotifications(),
  });

  const data = notifData as NotificationsData | undefined;
  const config = data?.config;
  const history = data?.history ?? [];

  // Quiet hours local state
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");

  // Sync from server data
  useEffect(() => {
    if (config?.quietHours) {
      setQuietEnabled(true);
      setQuietStart(config.quietHours.start);
      setQuietEnd(config.quietHours.end);
    }
  }, [config?.quietHours?.start, config?.quietHours?.end]);

  const testMut = useMutation({
    mutationFn: () => testNotification(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.notifications }),
  });

  const updateRulesMut = useMutation({
    mutationFn: (rules: Record<string, any>) =>
      updateNotificationRules({ data: rules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.notifications });
      toast.success("Quiet hours updated");
    },
    onError: (err: Error) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const handleSaveQuietHours = () => {
    if (quietEnabled) {
      updateRulesMut.mutate({ quietHours: { start: quietStart, end: quietEnd } });
    } else {
      updateRulesMut.mutate({ quietHours: { start: "00:00", end: "00:00" } });
    }
  };

  const quietActive = quietEnabled && isWithinQuietHours(quietStart, quietEnd);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Notifications</h3>
        {config && (
          <Badge
            variant={config.enabled ? "default" : "outline"}
            className={`text-xs ${config.enabled ? "text-green-400" : "text-muted-foreground"}`}
          >
            {config.enabled ? "enabled" : "disabled"}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load notifications: {error?.message}
        </div>
      )}

      {/* Config Section */}
      {config && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Configuration
          </h4>
          <Card>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Severity Threshold
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings className="size-3 text-muted-foreground" />
                    <Badge
                      variant="outline"
                      className={`text-xs ${SEVERITY_COLORS[config.severityThreshold] ?? "text-muted-foreground"}`}
                    >
                      {config.severityThreshold}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Rate Limit
                  </div>
                  <div className="text-sm font-mono">
                    {config.rateLimit} / {config.rateLimitWindow}s
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Channels</div>
                  <div className="flex flex-wrap gap-1">
                    {config.channels.map((ch) => (
                      <Badge
                        key={ch}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {ch}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quiet Hours Section */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase">
          Quiet Hours
        </h4>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Moon className="size-4" />
                Quiet Hours
                {quietActive && (
                  <Badge variant="secondary" className="text-[10px] text-amber-400">
                    active now
                  </Badge>
                )}
              </div>
              <Switch
                checked={quietEnabled}
                onCheckedChange={setQuietEnabled}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">Start</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  disabled={!quietEnabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet-end">End</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  disabled={!quietEnabled}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {quietEnabled
                  ? `Notifications silenced ${quietStart} - ${quietEnd}`
                  : "Quiet hours disabled"}
              </div>
              <Button
                size="sm"
                onClick={handleSaveQuietHours}
                disabled={updateRulesMut.isPending}
              >
                {updateRulesMut.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Notification */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => testMut.mutate()}
          disabled={testMut.isPending}
        >
          <Send className="size-3 mr-1.5" />
          Send Test Notification
        </Button>
        {testMut.isSuccess && (
          <span className="text-xs text-green-400">Test sent</span>
        )}
        {testMut.isError && (
          <span className="text-xs text-red-400">
            Failed: {testMut.error?.message}
          </span>
        )}
      </div>

      {/* Notification History */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            History
          </h4>
          <div className="space-y-2">
            {history.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Bell className="size-3 text-muted-foreground" />
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${SEVERITY_COLORS[entry.severity] ?? "text-muted-foreground"}`}
                    >
                      {entry.severity}
                    </Badge>
                    <span className="truncate">{entry.message}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-3">
                    <Badge variant="secondary" className="text-[10px]">
                      {entry.channel}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${entry.delivered ? "text-green-400" : "text-red-400"}`}
                    >
                      {entry.delivered ? "delivered" : "failed"}
                    </Badge>
                    <span>{new Date(entry.sentAt).toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!isLoading && history.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No notification history.
        </div>
      )}
    </div>
  );
}
