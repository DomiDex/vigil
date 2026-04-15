import { useQuery } from "@tanstack/react-query";
import { Brain, Database, Layers, Archive } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getMemory } from "../../server/functions";
import { MemorySearch } from "../../components/vigil/memory-search";
import { AskVigil } from "../../components/vigil/ask-vigil";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import type { WidgetProps } from "../../types/plugin";
import type { MemoryData } from "../../types/api";

export const PIPELINE_STAGES: string[] = [
  "eventLog",
  "vectorStore",
  "topicTier",
  "indexTier",
];

const STAGE_LABELS: Record<string, string> = {
  eventLog: "Event Log",
  vectorStore: "Vector Store",
  topicTier: "Topic Tier",
  indexTier: "Index Tier",
};

const STAGE_ICONS: Record<string, typeof Brain> = {
  eventLog: Database,
  vectorStore: Layers,
  topicTier: Brain,
  indexTier: Archive,
};

export default function MemoryPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.memory.stats,
    queryFn: () => getMemory(),
  });

  const memoryData = data as MemoryData | undefined;
  const pipeline = memoryData?.pipeline;
  const profiles = memoryData?.profiles ?? [];

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium">Memory Pipeline</h3>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load data: {error?.message}
        </div>
      )}

      {pipeline && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const Icon = STAGE_ICONS[stage] ?? Database;
            const stageData = (pipeline as any)[stage];
            return (
              <Card key={stage}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Icon className="size-4" />
                    {STAGE_LABELS[stage] ?? stage}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stageData?.count ?? 0}</div>
                  {stage === "vectorStore" && stageData?.types && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(stageData.types).map(([type, count]) => (
                        <div
                          key={type}
                          className="flex justify-between text-xs text-muted-foreground"
                        >
                          <span>{type}</span>
                          <span>{count as number}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {stage === "eventLog" && stageData && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {stageData.oldestDate} - {stageData.newestDate}
                    </div>
                  )}
                  {(stage === "topicTier" || stage === "indexTier") &&
                    stageData?.repos && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {stageData.repos.map((repo: string) => (
                          <Badge
                            key={repo}
                            variant="outline"
                            className="text-xs"
                          >
                            {repo}
                          </Badge>
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Repo Profiles
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profiles.map((profile) => (
              <Card key={profile.repo}>
                <CardContent className="space-y-1">
                  <div className="font-medium text-sm">{profile.repo}</div>
                  <div className="text-xs text-muted-foreground">
                    {profile.summary}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{profile.patternCount} patterns</span>
                    <span>Updated: {profile.lastUpdated}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <MemorySearch repo={activeRepo ?? undefined} />
        <AskVigil repo={activeRepo ?? undefined} />
      </div>
    </div>
  );
}
