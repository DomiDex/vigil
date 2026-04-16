import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  GitBranch,
  Zap,
  Sparkles,
  HeartPulse,
  ArrowRight,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { ActionApproval } from "../../components/vigil/action-approval";
import { vigilKeys } from "../../lib/query-keys";
import {
  getOverview,
  getTimeline,
  getDreams,
  getActionsPending,
  getHealth,
  getMetrics,
  approveAction,
  rejectAction,
  triggerDream,
} from "../../server/functions";
import type { WidgetProps } from "../../types/plugin";
import type {
  OverviewData,
  ActionsPendingData,
  DreamsData,
  MetricsData,
  TimelineData,
} from "../../types/api";

function StatCard({
  icon: Icon,
  title,
  value,
  trend,
  href,
  isLoading,
}: {
  icon: LucideIcon;
  title: string;
  value: string | number;
  trend?: string;
  href: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Skeleton className="size-5" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link to={href} className="block">
      <Card className="cursor-pointer transition-colors hover:border-vigil/30">
        <CardContent className="flex items-center gap-3 py-4">
          <Icon className="size-5 text-vigil" />
          <div>
            <div className="text-xs text-text-muted">{title}</div>
            <div className="text-lg font-semibold">{value}</div>
            {trend && <div className="text-xs text-text-muted">{trend}</div>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="text-sm text-destructive p-4">
      Failed to load: {message}
    </div>
  );
}

export default function OverviewPage(_props: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const overview = useQuery<OverviewData>({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
    staleTime: 30_000,
  });
  const timeline = useQuery<TimelineData>({
    queryKey: vigilKeys.timeline({ page: 1 }),
    queryFn: () => getTimeline({ data: { page: 1 } }),
    staleTime: 30_000,
  });
  const dreams = useQuery<DreamsData>({
    queryKey: vigilKeys.dreams,
    queryFn: getDreams,
    staleTime: 30_000,
  });
  const pending = useQuery<ActionsPendingData>({
    queryKey: vigilKeys.actions.pending,
    queryFn: getActionsPending,
    staleTime: 30_000,
  });
  const health = useQuery<{ status?: string; uptime?: string }>({
    queryKey: vigilKeys.health,
    queryFn: getHealth,
    staleTime: 30_000,
  });
  const metrics = useQuery<MetricsData>({
    queryKey: vigilKeys.metrics,
    queryFn: getMetrics,
    staleTime: 30_000,
  });

  const pendingActions = pending.data?.pending ?? [];
  const repos = overview.data?.repos ?? [];
  const repoCount = overview.data?.repoCount ?? 0;
  const dreamCount = dreams.data?.dreams?.length ?? 0;
  const healthStatus = health.data?.status ?? "unknown";
  const lastEvents = timeline.data?.messages?.slice(0, 5) ?? [];

  const approve = useMutation({
    mutationFn: (id: string) => approveAction({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.pending }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectAction({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.pending }),
  });

  const dream = useMutation({
    mutationFn: () => triggerDream({ data: {} }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.dreams }),
  });

  return (
    <div className="space-y-6">
      {/* Stat Cards — each renders independently as its query resolves */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={GitBranch}
          title="Watched Repos"
          value={repoCount}
          href="/repos"
          isLoading={overview.isLoading}
        />
        <StatCard
          icon={Zap}
          title="Pending Actions"
          value={pendingActions.length}
          href="/actions"
          isLoading={pending.isLoading}
        />
        <StatCard
          icon={Sparkles}
          title="Total Dreams"
          value={dreamCount}
          href="/dreams"
          isLoading={metrics.isLoading}
        />
        <StatCard
          icon={HeartPulse}
          title="Health Score"
          value={healthStatus}
          href="/health"
          isLoading={health.isLoading}
        />
      </div>

      {/* Bottom 2-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.isLoading ? (
                <SectionSkeleton />
              ) : timeline.isError ? (
                <SectionError message={timeline.error?.message ?? "Unknown error"} />
              ) : lastEvents.length > 0 ? (
                <div className="space-y-3">
                  {lastEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {event.decision}
                      </Badge>
                      <span className="text-text-muted line-clamp-1">{event.message}</span>
                    </div>
                  ))}
                  <Link to="/timeline" className="block">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                    >
                      View all <ArrowRight className="ml-1 size-3" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-text-muted">
                  No recent activity.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Actions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Pending Actions</CardTitle>
                {pendingActions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {pendingActions.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pending.isLoading ? (
                <SectionSkeleton />
              ) : pending.isError ? (
                <SectionError message={pending.error?.message ?? "Unknown error"} />
              ) : pendingActions.length > 0 ? (
                <div className="space-y-3">
                  {pendingActions.slice(0, 3).map((action) => (
                    <ActionApproval
                      key={action.id}
                      action={action}
                      onApprove={(id) => approve.mutate(id)}
                      onReject={(id) => reject.mutate(id)}
                    />
                  ))}
                  {pendingActions.length > 3 && (
                    <Link to="/actions" className="block">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                      >
                        View all ({pendingActions.length}) <ArrowRight className="ml-1 size-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-text-muted">
                  No pending actions.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Repo Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Repo Status</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.isLoading ? (
                <SectionSkeleton />
              ) : overview.isError ? (
                <SectionError message={overview.error?.message ?? "Unknown error"} />
              ) : repos.length > 0 ? (
                <div className="space-y-2">
                  {repos.map((repo) => (
                    <div
                      key={repo.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium">{repo.name}</span>
                      <Badge
                        variant={repo.state === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {repo.state}
                      </Badge>
                    </div>
                  ))}
                  <Link to="/repos" className="block">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                    >
                      View all <ArrowRight className="ml-1 size-3" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-text-muted">
                  No repos watched.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dream Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dream Status</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.isLoading ? (
                <SectionSkeleton />
              ) : metrics.isError ? (
                <SectionError message={metrics.error?.message ?? "Unknown error"} />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">State</span>
                    <Badge variant="secondary" className="text-xs">
                      {metrics.data?.state?.isSleeping ? "sleeping" : "awake"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Uptime</span>
                    <span>{metrics.data?.state?.uptime ?? "\u2014"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Total Ticks</span>
                    <span>{metrics.data?.ticks?.total ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Avg Latency</span>
                    <span>{metrics.data?.latency?.avg ? `${Math.round(metrics.data.latency.avg)}ms` : "\u2014"}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => dream.mutate()}
                    disabled={dream.isPending}
                  >
                    <Play className="mr-1 size-3" />
                    {dream.isPending ? "Triggering..." : "Trigger Dream"}
                  </Button>
                  <Link to="/dreams" className="block">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                    >
                      View dreams <ArrowRight className="ml-1 size-3" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
