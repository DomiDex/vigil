import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { vigilKeys } from "../../lib/query-keys";
import { searchMemory } from "../../server/functions";
import type { MemorySearchResult } from "../../types/api";

export function formatConfidence(score: number): string {
  return Math.round(score * 100) + "%";
}

interface MemorySearchProps {
  repo?: string;
}

export function MemorySearch({ repo }: MemorySearchProps) {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.memory.search(searchQuery),
    queryFn: () => searchMemory({ data: { query: searchQuery, repo } }),
    enabled: searchQuery.length > 0,
  });

  const results: MemorySearchResult[] = data?.results ?? [];

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
                <span className="text-xs font-mono text-muted-foreground">
                  {formatConfidence(result.confidence)}
                </span>
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
