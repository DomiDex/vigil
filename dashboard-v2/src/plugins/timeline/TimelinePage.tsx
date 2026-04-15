import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getTimeline, getRepos } from "../../server/functions";
import { TimelineEntry } from "../../components/vigil/timeline-entry";
import { DecisionFilter } from "./DecisionFilter";
import type { WidgetProps } from "../../types/plugin";

interface Filters {
  status?: string;
  repo?: string;
  q?: string;
  page?: number;
}

export default function TimelinePage({ activeRepo }: WidgetProps) {
  const [filters, setFilters] = useState<Filters>({
    repo: activeRepo ?? undefined,
    page: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, q: searchInput || undefined, page: 1 }));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.timeline(filters),
    queryFn: () => getTimeline({ data: filters }),
  });

  const { data: repos } = useQuery({
    queryKey: vigilKeys.repos.all,
    queryFn: () => getRepos(),
  });

  const messages = data?.messages ?? [];
  const page = filters.page ?? 1;
  const hasMore = data?.hasMore ?? false;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-xs">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          <span className="text-muted-foreground">Live</span>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search timeline..."
            className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <select
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={filters.repo ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              repo: e.target.value || undefined,
              page: 1,
            }))
          }
        >
          <option value="">All repos</option>
          {repos?.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <DecisionFilter
        value={filters.status}
        onChange={(status) => setFilters((f) => ({ ...f, status, page: 1 }))}
      />

      <div className="space-y-2">
        {isLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}
        {messages.map((msg) => (
          <TimelineEntry key={msg.id} message={msg} />
        ))}
        {!isLoading && messages.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No timeline entries found.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))}
          className="inline-flex items-center justify-center rounded-md bg-muted px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs text-muted-foreground">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          disabled={!hasMore}
          onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))}
          className="inline-flex items-center justify-center rounded-md bg-muted px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
