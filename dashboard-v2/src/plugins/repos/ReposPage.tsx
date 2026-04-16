import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vigilKeys } from "../../lib/query-keys";
import { getRepos, getRepoDetail, getRepoDiff, addRepo, removeRepo } from "../../server/functions";
import { RepoCard, computeDecisionPercentages, formatSha } from "../../components/vigil/repo-card";
import { DiffViewer } from "../../components/vigil/diff-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { GitBranch, GitCommit, Plus, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { WidgetProps } from "../../types/plugin";
import type { RepoListItem, RepoDetail } from "../../types/api";

export default function ReposPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();
  const [selectedRepo, setSelectedRepo] = useState<string | null>(
    activeRepo ?? null,
  );
  const [showDiff, setShowDiff] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState("");

  const { data: reposData, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.repos.all,
    queryFn: () => getRepos(),
  });

  const repos: RepoListItem[] = Array.isArray(reposData) ? reposData : [];

  const { data: detail } = useQuery<RepoDetail | null>({
    queryKey: vigilKeys.repos.detail(selectedRepo ?? ""),
    queryFn: () => getRepoDetail({ data: { name: selectedRepo! } }),
    enabled: !!selectedRepo,
  });

  const { data: diffData, isLoading: diffLoading } = useQuery({
    queryKey: vigilKeys.repos.diff(selectedRepo ?? ""),
    queryFn: () => getRepoDiff({ data: { name: selectedRepo! } }),
    enabled: !!selectedRepo && showDiff,
  });

  const addRepoMut = useMutation({
    mutationFn: (path: string) => addRepo({ data: { path } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.repos.all });
      toast.success("Repo added to watch list");
      setAddDialogOpen(false);
      setNewRepoPath("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const removeRepoMut = useMutation({
    mutationFn: (name: string) => removeRepo({ data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.repos.all });
      setSelectedRepo(null);
      setShowDiff(false);
      toast.success("Repo removed from watch list");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Repositories
          </h3>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <Plus className="size-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Watch Repository</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newRepoPath.trim()) {
                    addRepoMut.mutate(newRepoPath.trim());
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="repo-path">Repository path</Label>
                  <Input
                    id="repo-path"
                    placeholder="/home/user/projects/my-repo"
                    value={newRepoPath}
                    onChange={(e) => setNewRepoPath(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Absolute path to a git repository.
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={!newRepoPath.trim() || addRepoMut.isPending}
                >
                  {addRepoMut.isPending ? "Adding..." : "Watch Repo"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}
        {isError && (
          <div className="text-sm text-destructive p-4">
            Failed to load data: {error?.message}
          </div>
        )}
        {repos.map((repo) => (
          <RepoCard
            key={repo.name}
            repo={repo}
            isSelected={selectedRepo === repo.name}
            onSelect={() => {
              setSelectedRepo(repo.name);
              setShowDiff(false);
            }}
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
                  <span className="flex-1">{detail.name}</span>
                  <div className="flex items-center gap-1">
                    {detail.dirty && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowDiff(!showDiff)}
                      >
                        <Eye className="size-3 mr-1" />
                        {showDiff ? "Hide Diff" : "View Diff"}
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive">
                          <Trash2 className="size-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Stop Watching</AlertDialogTitle>
                          <AlertDialogDescription>
                            Remove <span className="font-medium">{detail.name}</span> from
                            Vigil's watch list? This won't affect the repository itself.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => removeRepoMut.mutate(detail.name)}
                          >
                            Stop Watching
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
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

            {showDiff && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Working Tree Diff</CardTitle>
                </CardHeader>
                <CardContent>
                  {diffLoading ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      Loading diff...
                    </div>
                  ) : diffData ? (
                    <DiffViewer
                      files={diffData.files ?? []}
                      truncated={diffData.truncated ?? false}
                      stats={diffData.stats}
                    />
                  ) : null}
                </CardContent>
              </Card>
            )}

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
