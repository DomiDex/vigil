import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import {
  getFlakyTests,
  runFlakyTests,
  resetFlakyTest,
} from "../../server/functions";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/cn";
import type { FlakyTestsResponse, FlakyTestItem } from "../../types/api";

function getPassRateColor(rate: number): string {
  if (rate <= 0.5) return "text-red-400";
  if (rate <= 0.8) return "text-yellow-400";
  return "text-green-400";
}

function getStatusBadge(item: FlakyTestItem): { label: string; className: string } {
  if (item.status === "flaky" && item.isDefinitive) {
    return { label: "FLAKY (def.)", className: "text-red-400 bg-red-400/10 border-0" };
  }
  if (item.status === "flaky") {
    return { label: "FLAKY (stat.)", className: "text-yellow-400 bg-yellow-400/10 border-0" };
  }
  if (item.status === "stable") {
    return { label: "STABLE", className: "text-green-400 bg-green-400/10 border-0" };
  }
  return { label: "N/A", className: "text-muted-foreground" };
}

export default function FlakyTestsTab() {
  const queryClient = useQueryClient();
  const [repoFilter, setRepoFilter] = useState("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.specialists.flaky(
      repoFilter !== "all" ? repoFilter : undefined,
    ),
    queryFn: () =>
      getFlakyTests({
        data: { repo: repoFilter !== "all" ? repoFilter : undefined },
      }),
  });

  const response = data as FlakyTestsResponse | undefined;
  const tests = response?.tests ?? [];
  const summary = response?.summary;

  const repos = useMemo(
    () => [...new Set(tests.map((t) => t.repo))],
    [tests],
  );

  const runMut = useMutation({
    mutationFn: (repo: string) => runFlakyTests({ data: { repo } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialists", "flaky"] });
      toast.success("Test run triggered");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetMut = useMutation({
    mutationFn: (testName: string) => resetFlakyTest({ data: { testName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialists", "flaky"] });
      toast.success("Flaky data reset");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-8">Loading...</div>
    );
  }
  if (isError) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load: {error?.message}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {summary && (
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-xs">
            {summary.totalTracked} tracked
          </Badge>
          <Badge variant="secondary" className="text-xs text-red-400">
            {summary.flakyCount} flaky
          </Badge>
          <Badge variant="secondary" className="text-xs text-green-400">
            {summary.stableCount} stable
          </Badge>
          <Badge variant="secondary" className="text-xs text-muted-foreground">
            {summary.insufficientData} pending
          </Badge>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {repos.length > 1 && (
            <Select value={repoFilter} onValueChange={setRepoFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Filter repo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All repos</SelectItem>
                {repos.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const repo = repoFilter !== "all" ? repoFilter : repos[0];
            if (repo) runMut.mutate(repo);
          }}
          disabled={
            runMut.isPending ||
            repos.length === 0 ||
            (repoFilter === "all" && repos.length > 1)
          }
          title={
            repoFilter === "all" && repos.length > 1
              ? "Pick a repo to run"
              : undefined
          }
        >
          {runMut.isPending ? (
            <Loader2 className="size-3 mr-1 animate-spin" />
          ) : (
            <Play className="size-3 mr-1" />
          )}
          Run Tests
        </Button>
      </div>

      {tests.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Test Name</TableHead>
                <TableHead className="w-[80px]">Pass Rate</TableHead>
                <TableHead className="w-[60px]">Runs</TableHead>
                <TableHead className="w-[80px]">Flaky Commits</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((t) => {
                const status = getStatusBadge(t);
                return (
                  <TableRow key={`${t.repo}-${t.testFile}-${t.testName}`}>
                    <TableCell
                      className="text-xs font-mono max-w-[300px] truncate"
                      title={t.testName}
                    >
                      {t.testName}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-xs font-medium",
                        getPassRateColor(t.passRate),
                      )}
                    >
                      {Math.round(t.passRate * 100)}%
                    </TableCell>
                    <TableCell className="text-xs">{t.totalRuns}</TableCell>
                    <TableCell className="text-xs">{t.flakyCommits}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", status.className)}
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        title="Reset flaky data"
                        onClick={() => resetMut.mutate(t.testName)}
                        disabled={
                          resetMut.isPending &&
                          resetMut.variables === t.testName
                        }
                      >
                        <Trash2 className="size-3 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">
          No test data recorded yet. Run tests to start tracking flakiness.
        </div>
      )}
    </div>
  );
}
