import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: getOverview,
  });
  const timeline = useQuery({
    queryKey: vigilKeys.timeline({ page: 1 }),
    queryFn: () => getTimeline({ data: { page: 1 } }),
  });
  const pending = useQuery({
    queryKey: vigilKeys.actions.pending,
    queryFn: getActionsPending,
  });
  const health = useQuery({
    queryKey: vigilKeys.health,
    queryFn: getHealth,
  });
  const metrics = useQuery({
    queryKey: vigilKeys.metrics,
    queryFn: getMetrics,
  });

  const overviewData = overview.data as OverviewData | undefined;
  const pendingData = pending.data as ActionsPendingData | undefined;
  const metricsData = metrics.data as MetricsData | undefined;
  const healthData = health.data as { status?: string; uptime?: string } | undefined;
  const timelineData = timeline.data as TimelineData | undefined;

  const pendingActions = pendingData?.pending ?? [];
  const repos = overviewData?.repos ?? [];
  const repoCount = overviewData?.repoCount ?? 0;
  const dreamCount = metricsData?.ticks?.total ?? 0;
  const healthStatus = healthData?.status ?? "unknown";
  const lastEvents = timelineData?.messages?.slice(0, 5) ?? [];

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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => navigate({ to: "/timeline" })}
                  >
                    View all <ArrowRight className="ml-1 size-3" />
                  </Button>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => navigate({ to: "/actions" })}
                    >
                      View all ({pendingActions.length}) <ArrowRight className="ml-1 size-3" />
                    </Button>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => navigate({ to: "/repos" })}
                  >
                    View all <ArrowRight className="ml-1 size-3" />
                  </Button>
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
                      {metricsData?.state?.isSleeping ? "sleeping" : "awake"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Uptime</span>
                    <span>{metricsData?.state?.uptime ?? "\u2014"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Total Ticks</span>
                    <span>{metricsData?.ticks?.total ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Avg Latency</span>
                    <span>{metricsData?.latency?.avg ? `${Math.round(metricsData.latency.avg)}ms` : "\u2014"}</span>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => navigate({ to: "/dreams" })}
                  >
                    View dreams <ArrowRight className="ml-1 size-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
