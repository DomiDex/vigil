import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Trash2, Shield, Send } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getChannels,
  registerChannel,
  deleteChannel,
  testChannel,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import ChannelPermissionSheet from "./ChannelPermissionSheet";
import type { WidgetProps } from "../../types/plugin";

interface Channel {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive" | "error";
  queueDepth: number;
  permissions: string[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  inactive: "text-muted-foreground",
  error: "text-red-400",
};

export default function ChannelsPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();
  const [permSheetChannel, setPermSheetChannel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const {
    data: channelsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: vigilKeys.channels.all,
    queryFn: () => getChannels(),
  });

  const channels = (channelsData as Channel[] | undefined) ?? [];

  const registerMut = useMutation({
    mutationFn: (payload: { name: string; type: string }) =>
      registerChannel({ data: payload }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.channels.all }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChannel({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.channels.all }),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testChannel({ data: { id } }),
    onSuccess: () => toast.success("Test message sent"),
    onError: (err: Error) => toast.error(`Test failed: ${err.message}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Radio className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Channels</h3>
        <Badge variant="secondary" className="text-xs">
          {channels.length} registered
        </Badge>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load channels: {error?.message}
        </div>
      )}

      {/* Channel List */}
      <div className="space-y-2">
        {channels.map((ch) => (
          <Card key={ch.id}>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Radio className="size-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{ch.name}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${STATUS_COLORS[ch.status] ?? "text-muted-foreground"}`}
                      >
                        {ch.status}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {ch.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Queue: {ch.queueDepth}
                      </span>
                      {ch.permissions.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Shield className="size-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {ch.permissions.length} permissions
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => testMut.mutate(ch.id)}
                    disabled={testMut.isPending || ch.status === "inactive"}
                  >
                    <Send className="size-3" />
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      setPermSheetChannel({ id: ch.id, name: ch.name })
                    }
                  >
                    <Shield className="size-3" />
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => deleteMut.mutate(ch.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && channels.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No channels registered.
        </div>
      )}

      {permSheetChannel && (
        <ChannelPermissionSheet
          channelId={permSheetChannel.id}
          channelName={permSheetChannel.name}
          open={!!permSheetChannel}
          onOpenChange={(open) => {
            if (!open) setPermSheetChannel(null);
          }}
        />
      )}
    </div>
  );
}
