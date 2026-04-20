import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import { Activity, GitBranch, Circle, Moon, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { getOverview, getRepos } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";
import type { PluginWidget } from "../../types/plugin";
import type { RepoListItem } from "../../types/api";

interface AppSidebarProps {
  plugins: PluginWidget[];
}

function RepoStateIndicator({
  state,
  dirty,
}: {
  state: string;
  dirty: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {dirty && <span className="size-1.5 rounded-full bg-warning" />}
      {state === "active" && (
        <Circle className="size-2.5 fill-success text-success" />
      )}
      {state === "sleeping" && <Moon className="size-2.5 text-text-dimmed" />}
      {state === "dreaming" && <Sparkles className="size-2.5 text-vigil" />}
    </span>
  );
}

function DaemonStateIcon({ state }: { state?: string }) {
  if (state === "sleeping") return <Moon className="size-4 text-text-muted" />;
  if (state === "dreaming") return <Sparkles className="size-4 text-vigil" />;
  return <Circle className="size-4 fill-success text-success" />;
}

export function AppSidebar({ plugins }: AppSidebarProps) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const tabs = plugins
    .filter((p) => p.slot === "tab")
    .sort((a, b) => a.order - b.order);

  const { data: repos } = useQuery({
    queryKey: vigilKeys.repos.all,
    queryFn: () => getRepos(),
  });

  const { data: overview } = useQuery({
    queryKey: vigilKeys.overview,
    queryFn: () => getOverview(),
    refetchInterval: 30_000,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-vigil text-white shadow-[0_0_12px_rgba(255,129,2,0.3)]">
                  <Activity className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold tracking-tight text-text">Vigil</span>
                  <span className="text-[11px] text-text-dimmed font-medium">Dashboard</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="overflow-hidden gap-1">
        <SidebarGroup className="py-1 gap-1">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.08em] text-text-dimmed font-semibold h-6">
            Navigation
          </SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {tabs.map((tab) => {
              const Icon = (LucideIcons as Record<string, any>)[tab.icon];
              const path = tab.path;
              const isActive = pathname === path;
              return (
                <SidebarMenuItem key={tab.id}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    isActive={isActive}
                    tooltip={tab.label}
                    className={
                      isActive
                        ? "relative text-vigil before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-vigil"
                        : "text-text-muted hover:text-text"
                    }
                  >
                    <Link to={path}>
                      {Icon && <Icon className="size-3.5" />}
                      <span className="text-xs font-medium">{tab.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="flex-1 min-h-0 py-1 gap-1">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.08em] text-text-dimmed font-semibold h-6">
            Repositories
          </SidebarGroupLabel>
          <SidebarMenu className="gap-0.5 overflow-y-auto">
            {repos?.map((repo: RepoListItem) => (
              <SidebarMenuItem key={repo.name}>
                <SidebarMenuButton
                  size="sm"
                  tooltip={repo.name}
                  className="text-text-muted hover:text-text"
                >
                  <GitBranch className="size-3.5" />
                  <span className="text-xs">{repo.name}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>
                  <RepoStateIndicator
                    state={repo.state}
                    dirty={repo.dirty}
                  />
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`${overview?.state ?? "..."} — Tick ${overview?.tickCount ?? 0}`}
              className="text-text-muted"
            >
              <DaemonStateIcon state={overview?.state} />
              <div className="flex flex-col gap-0.5 text-xs leading-none">
                <span className="capitalize font-medium text-text">
                  {overview?.state ?? "..."}
                </span>
                <span className="text-text-dimmed text-[11px]">
                  Tick {overview?.tickCount ?? 0} — {overview?.uptime ?? "..."}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
