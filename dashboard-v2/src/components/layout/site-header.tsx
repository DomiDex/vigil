import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { NextTickCountdown } from "./next-tick-countdown";
import { getOverview } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";

export const routeLabels: Record<string, string> = {
  "/": "Timeline",
  "/repos": "Repos",
  "/dreams": "Dreams",
  "/tasks": "Tasks",
  "/actions": "Actions",
  "/memory": "Memory",
  "/metrics": "Metrics",
  "/scheduler": "Scheduler",
  "/config": "Config",
};

export function SiteHeader() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const pageLabel = routeLabels[pathname] ?? "Dashboard";

  const { data: overview } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: () => getOverview(),
    refetchInterval: 30_000,
  });

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface-dark px-4">
      <SidebarTrigger className="-ml-1 text-text-muted" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Vigil</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      {overview && (
        <div className="flex items-center gap-3">
          <NextTickCountdown nextTickIn={overview.nextTickIn} />
          <Badge variant="outline">{overview.repoCount} repos</Badge>
        </div>
      )}
    </header>
  );
}
