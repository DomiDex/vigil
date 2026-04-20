import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { vigilKeys } from "../../lib/query-keys";
import {
  getSpecialistFindings,
  getSpecialists,
} from "../../server/functions";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import type {
  FindingSeverity,
  FindingsListResponse,
  SpecialistsListResponse,
} from "../../types/api";
import type { AgentsSearch, AgentsSearchInput } from "../../routes/agents";
import { FindingDetailSheet } from "./FindingDetailSheet";
import { severityClasses } from "./severity";
import { formatRelativeTime } from "./time";

const PAGE_SIZE = 25;
const ALL = "all" as const;

function stripAll<T extends string>(v: T | typeof ALL): T | undefined {
  return v === ALL ? undefined : v;
}

interface FindingsTabProps {
  activeId?: string;
}

export default function FindingsTab({ activeId }: FindingsTabProps) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    specialist: "all",
    severity: "all",
    repo: "all",
  });
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(activeId ?? null);

  useEffect(() => {
    setDetailId(activeId ?? null);
  }, [activeId]);

  const specialist = stripAll(filters.specialist);
  const severity = stripAll(filters.severity) as FindingSeverity | undefined;
  const repo = stripAll(filters.repo);
  const queryFilters: Record<string, string | number | undefined> = {
    ...(specialist && { specialist }),
    ...(severity && { severity }),
    ...(repo && { repo }),
    page,
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.specialists.findings.list(queryFilters),
    queryFn: () =>
      getSpecialistFindings({
        data: { specialist, severity, repo, page },
      }),
  });
  const response = data as FindingsListResponse | undefined;
  const findings = response?.findings ?? [];
  const total = response?.total ?? 0;
  const hasMore = response?.hasMore ?? false;

  const { data: specialistsData } = useQuery({
    queryKey: vigilKeys.specialists.all,
    queryFn: () => getSpecialists(),
  });
  const specialistsList =
    (specialistsData as SpecialistsListResponse | undefined)?.specialists ?? [];

  const repoOptions = Array.from(
    new Set(findings.map((f) => f.repo).filter(Boolean)),
  );

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function openDetail(id: string) {
    setDetailId(id);
    navigate({
      to: "/agents",
      search: (prev: AgentsSearchInput): AgentsSearch => ({
        ...prev,
        tab: "findings",
        id,
      }),
    });
  }

  function closeDetail() {
    setDetailId(null);
    navigate({
      to: "/agents",
      search: (prev: AgentsSearchInput): AgentsSearch => ({
        ...prev,
        tab: "findings",
        id: undefined,
      }),
    });
  }

  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + findings.length, total);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.specialist}
          onValueChange={(v) => updateFilter("specialist", v)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Specialist" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specialists</SelectItem>
            {specialistsList.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.severity}
          onValueChange={(v) => updateFilter("severity", v)}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warning">warning</SelectItem>
            <SelectItem value="critical">critical</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.repo}
          onValueChange={(v) => updateFilter("repo", v)}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Repo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All repos</SelectItem>
            {repoOptions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load: {error?.message}
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Severity</TableHead>
                  <TableHead className="w-[140px]">Specialist</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[200px]">File</TableHead>
                  <TableHead className="w-[120px]">Repo</TableHead>
                  <TableHead className="w-[180px]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-xs text-muted-foreground text-center py-8"
                    >
                      No findings.
                    </TableCell>
                  </TableRow>
                ) : (
                  findings.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer"
                      onClick={() => openDetail(f.id)}
                    >
                      <TableCell>
                        <Badge className={severityClasses(f.severity)}>
                          {f.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {f.specialist}
                      </TableCell>
                      <TableCell className="text-xs">{f.title}</TableCell>
                      <TableCell className="text-xs font-mono truncate max-w-[200px]">
                        {f.file
                          ? `${f.file}${f.line ? `:${f.line}` : ""}`
                          : ""}
                      </TableCell>
                      <TableCell className="text-xs">{f.repo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelativeTime(f.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {total > 0
                ? `Showing ${start + 1}-${end} of ${total}`
                : "0 results"}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <FindingDetailSheet
        findingId={detailId}
        open={detailId !== null}
        onClose={closeDetail}
      />
    </div>
  );
}
