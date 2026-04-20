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
import { NextTickCountdown } from "./next-tick-countdown";
import { getOverview } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";

export const routeLabels: Record<string, string> = {
  "/": "Overview",
  "/timeline": "Timeline",
  "/repos": "Repos",
  "/dreams": "Dreams",
  "/tasks": "Tasks",
  "/actions": "Actions",
  "/memory": "Memory",
  "/metrics": "Metrics",
  "/scheduler": "Scheduler",
  "/config": "Config",
  "/agents": "Agents",
  "/health": "Health",
  "/webhooks": "Webhooks",
  "/channels": "Channels",
  "/notifications": "Notifications",
  "/a2a": "A2A",
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-black/20 px-6 backdrop-blur-sm">
      <SidebarTrigger className="-ml-1 text-text-muted hover:text-text transition-colors" />
      <Separator orientation="vertical" className="mr-2 h-4 bg-white/[0.08]" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/" className="text-text-muted hover:text-vigil transition-colors text-sm">
              Vigil
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="text-text-dimmed" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-text font-medium text-sm">{pageLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      {overview && (
        <div className="flex items-center gap-4">
          <NextTickCountdown nextTickIn={overview.nextTickIn} />
        </div>
      )}
    </header>
  );
}
