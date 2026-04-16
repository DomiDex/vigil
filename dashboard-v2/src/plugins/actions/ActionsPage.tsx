import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import { getActions, approveAction, rejectAction } from "../../server/functions";
import { ActionApproval, getTierBadgeClasses } from "../../components/vigil/action-approval";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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
import type { WidgetProps } from "../../types/plugin";
import type { ActionsData } from "../../types/api";

const TIER_ORDER: Record<string, number> = { safe: 0, moderate: 1, dangerous: 2 };
const PER_PAGE = 25;

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "approved":
      return "text-green-400";
    case "rejected":
      return "text-red-400";
    case "executed":
      return "text-blue-400";
    case "failed":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${month}/${day} ${hour}:${m} ${ampm}`;
}

export default function ActionsPage({ activeRepo }: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const [sortBy, setSortBy] = useState<"date" | "status" | "tier" | "command">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.actions.all,
    queryFn: () => getActions({ data: {} }),
  });

  const actionsData = data as ActionsData | undefined;
  const pending = actionsData?.pending ?? [];
  const actions = actionsData?.actions ?? [];
  const stats = actionsData?.stats ?? {
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
    pending: 0,
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveAction({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.all }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectAction({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.all }),
  });

  // History: all resolved actions
  const allHistory = actions.filter(
    (a) => a.status === "approved" || a.status === "rejected" || a.status === "executed" || a.status === "failed"
  );

  // Filter
  const filteredHistory =
    statusFilter === "all"
      ? allHistory
      : allHistory.filter((a) => a.status === statusFilter);

  // Sort
  const sortedHistory = [...filteredHistory].sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "date":
        cmp = a.createdAt - b.createdAt;
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "tier":
        cmp = (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0);
        break;
      case "command":
        cmp = a.command.localeCompare(b.command);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Paginate
  const startIndex = page * PER_PAGE;
  const endIndex = Math.min(startIndex + PER_PAGE, sortedHistory.length);
  const pageData = sortedHistory.slice(startIndex, endIndex);

  function handleSort(col: "date" | "status" | "tier" | "command") {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(0);
  }

  function SortHeader({ col, children }: { col: "date" | "status" | "tier" | "command"; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none"
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown className="size-3" />
        </span>
      </TableHead>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">Actions</h3>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            {stats.pending} pending
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {stats.approved} approved
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {stats.executed} executed
          </Badge>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load data: {error?.message}
        </div>
      )}

      {!isLoading && !isError && (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">
              Pending {pending.length > 0 && `(${pending.length})`}
            </TabsTrigger>
            <TabsTrigger value="history">
              History {allHistory.length > 0 && `(${allHistory.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3 mt-3">
            {pending.length > 0 ? (
              pending.map((action) => (
                <ActionApproval
                  key={action.id}
                  action={action}
                  onApprove={(id) => approve.mutate(id)}
                  onReject={(id) => reject.mutate(id)}
                />
              ))
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                No pending actions.
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3 mt-3">
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sortedHistory.length > 0 ? (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHeader col="date">Date</SortHeader>
                        <SortHeader col="command">Command</SortHeader>
                        <SortHeader col="tier">Tier</SortHeader>
                        <SortHeader col="status">Status</SortHeader>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageData.map((action) => {
                        const tierClasses = getTierBadgeClasses(action.tier);
                        return (
                          <TableRow key={action.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatDate(action.createdAt)}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {action.command}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(tierClasses.bg, tierClasses.text, "border-0 text-xs")}
                              >
                                {action.tier}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={cn(getStatusBadgeClasses(action.status), "border-0 text-xs")}
                              >
                                {action.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {Math.round(action.confidence * 100)}%
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {action.reason.length > 60
                                ? `${action.reason.slice(0, 60)}...`
                                : action.reason}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    Showing {startIndex + 1}-{endIndex} of {sortedHistory.length}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={endIndex >= sortedHistory.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                No resolved actions.
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {!isLoading && actions.length === 0 && pending.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No actions recorded.
        </div>
      )}
    </div>
  );
}
