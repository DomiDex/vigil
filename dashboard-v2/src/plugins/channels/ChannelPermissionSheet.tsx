import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vigilKeys } from "../../lib/query-keys";
import {
  getChannelPermissions,
  updateChannelPermissions,
} from "../../server/functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../../components/ui/sheet";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { toast } from "sonner";

interface ChannelPermissionSheetProps {
  channelId: string;
  channelName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PERMISSION_KEYS = ["read", "write", "execute", "admin", "subscribe"] as const;
type PermKey = (typeof PERMISSION_KEYS)[number];

export default function ChannelPermissionSheet({
  channelId,
  channelName,
  open,
  onOpenChange,
}: ChannelPermissionSheetProps) {
  const queryClient = useQueryClient();

  const permsQuery = useQuery({
    queryKey: vigilKeys.channels.permissions(channelId),
    queryFn: () => getChannelPermissions({ data: { id: channelId } }),
    enabled: open,
  });

  const [localPerms, setLocalPerms] = useState<Record<PermKey, boolean>>({
    read: false,
    write: false,
    execute: false,
    admin: false,
    subscribe: false,
  });

  useEffect(() => {
    if (permsQuery.data) {
      const data = permsQuery.data as Record<string, unknown>;
      setLocalPerms({
        read: Boolean(data.read),
        write: Boolean(data.write),
        execute: Boolean(data.execute),
        admin: Boolean(data.admin),
        subscribe: Boolean(data.subscribe),
      });
    }
  }, [permsQuery.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateChannelPermissions({
        data: { id: channelId, permissions: localPerms },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: vigilKeys.channels.permissions(channelId),
      });
      queryClient.invalidateQueries({ queryKey: vigilKeys.channels.all });
      toast.success("Permissions updated");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Permissions: {channelName}</SheetTitle>
          <SheetDescription>
            Configure access permissions for this channel.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-1">
          {permsQuery.isLoading && (
            <div className="space-y-3">
              {PERMISSION_KEYS.map((key) => (
                <Skeleton key={key} className="h-8 w-full" />
              ))}
            </div>
          )}

          {!permsQuery.isLoading &&
            PERMISSION_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between py-2">
                <Label htmlFor={`perm-${key}`} className="text-sm capitalize">
                  {key}
                </Label>
                <Switch
                  id={`perm-${key}`}
                  checked={localPerms[key]}
                  onCheckedChange={(checked: boolean) =>
                    setLocalPerms((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              </div>
            ))}
        </div>

        <SheetFooter>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || permsQuery.isLoading}
          >
            {saveMut.isPending ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
