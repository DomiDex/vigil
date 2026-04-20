import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Moon, Play, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import {
  getDreams,
  getDreamPatterns,
  getOverview,
  triggerDream,
} from "../../server/functions";
import { DreamEntry } from "../../components/vigil/dream-entry";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Skeleton } from "../../components/ui/skeleton";
import { formatRelativeTime } from "../agents/time";
import type { WidgetProps } from "../../types/plugin";
import type {
  DreamsData,
  DreamPatternsData,
  OverviewData,
} from "../../types/api";

const ALL = "__all__";

type TriggerResponse = { ok: boolean; status: string };

function formatTriggerStatus(status: string): string {
  switch (status) {
    case "triggered":
      return "Dream started — consolidating recent observations.";
    case "already_running":
      return "A dream is already running. Wait for it to finish.";
    case "no_repo":
      return "No repository to dream about. Watch a repo first.";
    case "spawn_failed":
      return "Failed to spawn dream worker. Check the daemon logs.";
    default:
      return `Dream trigger: ${status}`;
  }
}

export default function DreamsPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const [repoFilter, setRepoFilter] = useState<string>(activeRepo ?? ALL);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.dreams,
    queryFn: () => getDreams(),
    refetchInterval: (query) => {
      const status = (query.state.data as DreamsData | undefined)?.status;
      return status?.running ? 3000 : false;
    },
  });

  const { data: overviewData } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
  });

  const dreamsData = data as DreamsData | undefined;
  const dreams = dreamsData?.dreams ?? [];
  const status = dreamsData?.status ?? { running: false };
  const watchedRepos = (overviewData as OverviewData | undefined)?.repos ?? [];

  const repoOptions = useMemo(() => {
    const fromDreams = new Set(dreams.map((d) => d.repo));
    const fromOverview = watchedRepos.map((r) => r.name);
    // Union of watched repos and repos seen in dream history.
    return Array.from(new Set([...fromOverview, ...fromDreams])).sort();
  }, [dreams, watchedRepos]);

  const filtered =
    repoFilter === ALL ? dreams : dreams.filter((d) => d.repo === repoFilter);

  const patternsRepo = repoFilter === ALL ? "" : repoFilter;
  const { data: patternsData, isLoading: patternsLoading } = useQuery({
    queryKey: vigilKeys.dreamPatterns(patternsRepo),
    queryFn: () => getDreamPatterns({ data: { repo: patternsRepo } }),
    enabled: !!patternsRepo,
  });
  const patterns = (patternsData as DreamPatternsData | undefined)?.patterns ?? [];
  const patternsUpdated =
    (patternsData as DreamPatternsData | undefined)?.lastUpdated ?? null;

  const trigger = useMutation({
    mutationFn: (repo?: string) => triggerDream({ data: { repo } }),
    onSuccess: (res: TriggerResponse) => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.dreams });
      if (res.ok) {
        toast.success(formatTriggerStatus(res.status));
      } else {
        toast.warning(formatTriggerStatus(res.status));
      }
    },
    onError: (err: Error) =>
      toast.error(`Failed to trigger dream: ${err.message}`),
  });

  const triggerTarget = repoFilter === ALL ? undefined : repoFilter;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Moon className="size-4 text-vigil" />
            <h3 className="text-sm font-medium">Dreams</h3>
            {status.running ? (
              <Badge
                variant="default"
                className="text-xs bg-vigil/15 text-vigil border-vigil/30 animate-pulse"
              >
                <Sparkles className="size-3 mr-1" />
                Dreaming{status.repo ? `: ${status.repo}` : ""}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Idle
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            Consolidated memories from recent observations. Patterns are
            long-lived summaries stored per repository.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={repoFilter} onValueChange={setRepoFilter}>
            <SelectTrigger className="w-48" aria-label="Filter by repository">
              <SelectValue placeholder="Filter by repo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All repositories</SelectItem>
              {repoOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => trigger.mutate(triggerTarget)}
            disabled={trigger.isPending || status.running}
          >
            {trigger.isPending || status.running ? (
              <Loader2 className="size-3 mr-1 animate-spin" />
            ) : (
              <Play className="size-3 mr-1" />
            )}
            {status.running
              ? "Dreaming…"
              : triggerTarget
                ? `Trigger ${triggerTarget}`
                : "Trigger Dream"}
          </Button>
        </div>
      </div>

      {isError && (
        <div className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
          Failed to load dreams: {error?.message}
        </div>
      )}

      <Tabs defaultValue="dreams">
        <TabsList>
          <TabsTrigger value="dreams">
            Dreams
            <Badge variant="secondary" className="text-xs ml-1">
              {filtered.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="patterns">
            Patterns
            {repoFilter !== ALL && (
              <Badge variant="secondary" className="text-xs ml-1">
                {patterns.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dreams" className="space-y-3 pt-2">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center space-y-3">
                <Moon className="size-8 mx-auto text-muted-foreground/60" />
                <div className="text-sm text-muted-foreground">
                  {repoFilter === ALL
                    ? "No dreams recorded yet."
                    : `No dreams for ${repoFilter} yet.`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Dreams run automatically during idle periods, or trigger one
                  manually.
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => trigger.mutate(triggerTarget)}
                  disabled={trigger.isPending || status.running}
                >
                  <Play className="size-3 mr-1" />
                  Trigger now
                </Button>
              </CardContent>
            </Card>
          ) : (
            filtered.map((dream, i) => (
              <DreamEntry key={`${dream.timestamp}-${i}`} dream={dream} />
            ))
          )}
        </TabsContent>

        <TabsContent value="patterns" className="space-y-3 pt-2">
          {repoFilter === ALL ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <Sparkles className="size-8 mx-auto text-muted-foreground/60" />
                <div className="text-sm text-muted-foreground">
                  Select a repository to view its patterns.
                </div>
                <div className="text-xs text-muted-foreground">
                  Patterns are persisted per repo in the vector store.
                </div>
              </CardContent>
            </Card>
          ) : patternsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : patterns.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No patterns yet for <span className="font-medium">{repoFilter}</span>.
              </CardContent>
            </Card>
          ) : (
            <>
              {patternsUpdated && (
                <div className="text-xs text-muted-foreground">
                  Last updated {formatRelativeTime(patternsUpdated)}
                </div>
              )}
              <div className="space-y-2">
                {patterns.map((pattern) => (
                  <Card key={pattern}>
                    <CardContent className="flex items-center gap-3 py-3">
                      <Sparkles className="size-4 text-vigil shrink-0" />
                      <span className="text-sm">{pattern}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
