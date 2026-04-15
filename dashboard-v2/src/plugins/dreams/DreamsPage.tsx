import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Play } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getDreams, triggerDream } from "../../server/functions";
import { DreamEntry } from "../../components/vigil/dream-entry";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";
import type { DreamsData } from "../../types/api";

export default function DreamsPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const [repoFilter, setRepoFilter] = useState<string | null>(
    activeRepo ?? null,
  );
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.dreams,
    queryFn: () => getDreams(),
  });

  const dreamsData = data as DreamsData | undefined;
  const dreams = dreamsData?.dreams ?? [];
  const status = dreamsData?.status ?? { running: false };

  const filtered = repoFilter
    ? dreams.filter((d) => d.repo === repoFilter)
    : dreams;

  const repos = [...new Set(dreams.map((d) => d.repo))];

  const trigger = useMutation({
    mutationFn: (repo?: string) => triggerDream({ data: { repo } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.dreams });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Dreams</h3>
          {status.running ? (
            <Badge variant="default" className="text-xs">
              <Sparkles className="size-3 mr-1" />
              Dreaming: {status.repo}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Idle
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => trigger.mutate(repoFilter ?? undefined)}
          disabled={trigger.isPending}
        >
          <Play className="size-3 mr-1" />
          Trigger Dream
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="xs"
          variant={repoFilter === null ? "default" : "secondary"}
          onClick={() => setRepoFilter(null)}
        >
          All
        </Button>
        {repos.map((repo) => (
          <Button
            key={repo}
            size="xs"
            variant={repoFilter === repo ? "default" : "secondary"}
            onClick={() => setRepoFilter(repo)}
          >
            {repo}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}

      <div className="space-y-3">
        {filtered.map((dream, i) => (
          <DreamEntry key={`${dream.timestamp}-${i}`} dream={dream} />
        ))}
      </div>

      {!isLoading && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No dreams recorded yet.
        </div>
      )}
    </div>
  );
}
