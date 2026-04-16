import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ThumbsUp, ThumbsDown, Trash2 } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
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
} from "../ui/alert-dialog";
import { vigilKeys } from "../../lib/query-keys";
import {
  searchMemory,
  deleteMemory,
  updateMemoryRelevance,
} from "../../server/functions";
import { toast } from "sonner";
import type { MemorySearchResult } from "../../types/api";

export function formatConfidence(score: number): string {
  return Math.round(score * 100) + "%";
}

interface MemorySearchProps {
  repo?: string;
}

export function MemorySearch({ repo }: MemorySearchProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.memory.search(searchQuery),
    queryFn: () => searchMemory({ data: { query: searchQuery, repo } }),
    enabled: searchQuery.length > 0,
  });

  const results: MemorySearchResult[] = data?.results ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMemory({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.memory.stats });
      if (searchQuery) {
        queryClient.invalidateQueries({
          queryKey: vigilKeys.memory.search(searchQuery),
        });
      }
      toast.success("Memory entry deleted");
    },
    onError: (err: Error) => {
      toast.error(`Failed to delete: ${err.message}`);
    },
  });

  const relevanceMut = useMutation({
    mutationFn: ({ id, relevant }: { id: string; relevant: boolean }) =>
      updateMemoryRelevance({ id, data: { relevant } }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.memory.stats });
      if (searchQuery) {
        queryClient.invalidateQueries({
          queryKey: vigilKeys.memory.search(searchQuery),
        });
      }
      toast.success(
        variables.relevant ? "Marked as relevant" : "Removed outdated entry",
      );
    },
    onError: (err: Error) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const handleSearch = () => {
    if (query.trim()) {
      setSearchQuery(query.trim());
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search memory..."
            className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button size="sm" onClick={handleSearch} disabled={!query.trim()}>
          Search
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Searching...</div>
      )}

      <div className="space-y-2">
        {results.map((result) => (
          <Card key={result.id}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {result.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {result.repo}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono text-muted-foreground mr-2">
                    {formatConfidence(result.confidence)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() =>
                      relevanceMut.mutate({
                        id: result.id,
                        relevant: true,
                      })
                    }
                    disabled={relevanceMut.isPending}
                    title="Mark as relevant"
                  >
                    <ThumbsUp className="size-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-amber-400"
                        title="Mark as outdated (removes entry)"
                      >
                        <ThumbsDown className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove outdated entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Marking as outdated will permanently delete this memory
                          entry. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            relevanceMut.mutate({
                              id: result.id,
                              relevant: false,
                            })
                          }
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        title="Delete entry"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete memory entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this memory entry from the
                          knowledge base. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMut.mutate(result.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <p className="text-sm">{result.content}</p>
              <div className="text-xs text-muted-foreground">
                {new Date(result.timestamp).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {searchQuery && !isLoading && results.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-4">
          No results found.
        </div>
      )}
    </div>
  );
}
