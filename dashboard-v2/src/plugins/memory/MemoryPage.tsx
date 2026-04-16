import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, Database, Layers, Archive, Plus } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getMemory, createMemory, getRepos } from "../../server/functions";
import { MemorySearch } from "../../components/vigil/memory-search";
import { AskVigil } from "../../components/vigil/ask-vigil";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
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
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { toast } from "sonner";
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
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [content, setContent] = useState("");
  const [repo, setRepo] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.memory.stats,
    queryFn: () => getMemory(),
  });

  const { data: reposData } = useQuery({
    queryKey: vigilKeys.repos.all,
    queryFn: () => getRepos(),
  });

  const repos: Array<{ name: string }> = Array.isArray(reposData) ? reposData : [];

  const createMut = useMutation({
    mutationFn: (formData: FormData) => createMemory({ data: formData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.memory.stats });
      toast.success("Memory entry created");
      setDialogOpen(false);
      setContent("");
      setRepo("");
      setTagsInput("");
    },
    onError: (err: Error) => {
      toast.error(`Failed to create memory: ${err.message}`);
    },
  });

  const handleCreate = () => {
    if (!content.trim()) return;
    const formData = new FormData();
    formData.set("content", content.trim());
    if (repo) formData.set("repo", repo);
    if (tagsInput.trim()) formData.set("tags", tagsInput.trim());
    createMut.mutate(formData);
  };

  const memoryData = data as MemoryData | undefined;
  const pipeline = memoryData?.pipeline;
  const profiles = memoryData?.profiles ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Memory Pipeline</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-3.5 mr-1.5" />
          New Memory
        </Button>
      </div>

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
                        {stageData.repos.map((repoName: string) => (
                          <Badge
                            key={repoName}
                            variant="outline"
                            className="text-xs"
                          >
                            {repoName}
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

      {/* New Memory Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Memory Entry</DialogTitle>
            <DialogDescription>
              Add a new entry to the knowledge base. It will be stored in the
              Vector Store and searchable via FTS5.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="memory-content">Content</Label>
              <Textarea
                id="memory-content"
                placeholder="Describe the knowledge or pattern..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
              />
              <div className="text-xs text-muted-foreground text-right">
                {content.length} / 5000
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-repo">Repository</Label>
              <Select value={repo} onValueChange={setRepo}>
                <SelectTrigger id="memory-repo">
                  <SelectValue placeholder="Select a repository (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {repos.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-tags">Tags</Label>
              <Input
                id="memory-tags"
                placeholder="git, deploy, pattern (comma-separated)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!content.trim() || content.length > 5000 || createMut.isPending}
            >
              {createMut.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
