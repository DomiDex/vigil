import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import {
  getSpecialists,
  runSpecialist,
  toggleSpecialist,
} from "../../server/functions";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { SpecialistCard } from "./SpecialistCard";
import { SpecialistEditSheet } from "./SpecialistEditSheet";
import type { SpecialistsListResponse } from "../../types/api";

export default function SpecialistsTab() {
  const queryClient = useQueryClient();
  const [editName, setEditName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.specialists.all,
    queryFn: () => getSpecialists(),
  });
  const response = data as SpecialistsListResponse | undefined;
  const specialists = response?.specialists ?? [];

  const toggleMut = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      toggleSpecialist({ data: { name, enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.specialists.all });
      toast.success("Specialist toggled");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const runMut = useMutation({
    mutationFn: (name: string) => runSpecialist({ data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.specialists.all });
      toast.success("Specialist run triggered");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground mt-4">Loading...</div>
    );
  }
  if (isError) {
    return (
      <div className="text-sm text-destructive p-4 mt-4">
        Failed to load: {error?.message}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {specialists.length} specialists
          </Badge>
          {response?.globalConfig && (
            <Badge
              variant={response.globalConfig.enabled ? "default" : "secondary"}
              className="text-xs"
            >
              {response.globalConfig.enabled ? "enabled" : "disabled"}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCreating(true)}
        >
          <Plus className="size-3 mr-1" />
          Create Agent
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {specialists.map((s) => (
          <SpecialistCard
            key={s.name}
            specialist={s}
            onToggle={(name, enabled) => toggleMut.mutate({ name, enabled })}
            onRun={(name) => runMut.mutate(name)}
            onEdit={(name) => setEditName(name)}
            isToggling={
              toggleMut.isPending &&
              (toggleMut.variables as { name: string } | undefined)?.name ===
                s.name
            }
            isRunning={runMut.isPending && runMut.variables === s.name}
          />
        ))}
      </div>

      {specialists.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No specialists configured.
        </div>
      )}

      <SpecialistEditSheet
        name={editName ?? undefined}
        open={editName !== null || creating}
        onClose={() => {
          setEditName(null);
          setCreating(false);
        }}
      />
    </div>
  );
}
