import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { vigilKeys } from "../../lib/query-keys";
import { getRepos, getRepoDetail } from "../../server/functions";
import { RepoCard, computeDecisionPercentages, formatSha } from "../../components/vigil/repo-card";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { GitBranch, GitCommit } from "lucide-react";
import type { WidgetProps } from "../../types/plugin";
import type { RepoListItem, RepoDetail } from "../../types/api";

export default function ReposPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const [selectedRepo, setSelectedRepo] = useState<string | null>(
    activeRepo ?? null,
  );

  const { data: reposData, isLoading } = useQuery({
    queryKey: vigilKeys.repos.all,
    queryFn: () => getRepos(),
  });

  const repos: RepoListItem[] = Array.isArray(reposData) ? reposData : [];

  const { data: detail } = useQuery<RepoDetail | null>({
    queryKey: vigilKeys.repos.detail(selectedRepo ?? ""),
    queryFn: () => getRepoDetail({ data: { name: selectedRepo! } }),
    enabled: !!selectedRepo,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Repositories
        </h3>
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}
        {repos.map((repo) => (
          <RepoCard
            key={repo.name}
            repo={repo}
            isSelected={selectedRepo === repo.name}
            onSelect={() => setSelectedRepo(repo.name)}
          />
        ))}
      </div>

      <div className="md:col-span-2 space-y-4">
        {detail ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="size-4" />
                  {detail.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <span>
                    Branch: <span className="font-mono">{detail.branch}</span>
                  </span>
                  <span>
                    HEAD:{" "}
                    <span className="font-mono">{formatSha(detail.head)}</span>
                  </span>
                  {detail.dirty && (
                    <Badge variant="outline">
                      {detail.dirtyFileCount} dirty files
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {detail.headMessage}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Decision Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {Object.entries(
                    computeDecisionPercentages(detail.decisions),
                  ).map(([key, pct]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="w-16 font-mono">{key}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right">{pct}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent Commits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {detail.recentCommits.map((commit) => (
                    <div
                      key={commit.hash}
                      className="flex items-start gap-2 text-xs"
                    >
                      <GitCommit className="size-3 mt-0.5 text-muted-foreground" />
                      <div>
                        <span className="font-mono text-muted-foreground">
                          {formatSha(commit.hash)}
                        </span>{" "}
                        <span>{commit.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {detail.topics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Topics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {detail.topics.map((t) => (
                      <Badge key={t.topic} variant="secondary">
                        {t.topic} ({t.mentions})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-8">
            Select a repository to view details.
          </div>
        )}
      </div>
    </div>
  );
}
