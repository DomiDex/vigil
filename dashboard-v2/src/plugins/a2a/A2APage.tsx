import { useQuery } from "@tanstack/react-query";
import { Network, Server, Activity } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getA2AStatus,
  getA2ASkills,
  getA2AHistory,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import type { WidgetProps } from "../../types/plugin";

interface A2AStatus {
  running: boolean;
  port: number;
  endpoint: string;
  auth: string;
  connections: number;
  uptime: number;
}

interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
}

interface A2AAgent {
  name: string;
  version: string;
  capabilities: string[];
  skills: A2ASkill[];
}

interface A2AHistoryEntry {
  id: string;
  time: string;
  method: string;
  statusCode: number;
  latency: number;
  tokens: number;
}

interface A2AData {
  status: A2AStatus;
  agent: A2AAgent;
  history: A2AHistoryEntry[];
  stats: {
    totalRequests: number;
    avgLatency: number;
    totalTokens: number;
    errorRate: number;
  };
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function A2APage({ activeRepo }: Partial<WidgetProps> = {}) {
  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
    error: statusErr,
  } = useQuery({
    queryKey: vigilKeys.a2a.status,
    queryFn: () => getA2AStatus(),
    refetchInterval: 10000,
  });

  const { data: skillsData } = useQuery({
    queryKey: vigilKeys.a2a.skills,
    queryFn: () => getA2ASkills(),
  });

  const { data: historyData } = useQuery({
    queryKey: vigilKeys.a2a.history,
    queryFn: () => getA2AHistory(),
  });

  const a2a = statusData as A2AData | undefined;
  const status = a2a?.status;
  const agent = a2a?.agent;
  const stats = a2a?.stats;
  const skills = (skillsData as A2ASkill[] | undefined) ?? agent?.skills ?? [];
  const history =
    (historyData as A2AHistoryEntry[] | undefined) ?? a2a?.history ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Network className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">A2A Server</h3>
        {status && (
          <Badge
            variant={status.running ? "default" : "outline"}
            className={`text-xs ${status.running ? "text-green-400" : "text-red-400"}`}
          >
            {status.running ? "running" : "stopped"}
          </Badge>
        )}
      </div>

      {statusLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {statusError && (
        <div className="text-sm text-destructive p-4">
          Failed to load A2A status: {statusErr?.message}
        </div>
      )}

      {/* Status Bar */}
      {status && (
        <Card>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Port</div>
                <div className="text-sm font-mono">{status.port}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Endpoint</div>
                <div className="text-sm font-mono truncate">
                  {status.endpoint}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Auth</div>
                <div className="text-sm font-mono">{status.auth}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Connections
                </div>
                <div className="text-sm font-mono">{status.connections}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Uptime</div>
                <div className="text-sm font-mono">
                  {formatUptime(status.uptime)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Card */}
      {agent && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Agent
          </h4>
          <Card className="border-vigil/30">
            <CardContent>
              <div className="flex items-start gap-3">
                <Server className="size-5 text-vigil mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{agent.name}</span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      v{agent.version}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities.map((cap) => (
                      <Badge
                        key={cap}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {cap}
                      </Badge>
                    ))}
                  </div>
                  {skills.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <div className="text-xs text-muted-foreground">
                        Skills ({skills.length})
                      </div>
                      <div className="space-y-1">
                        {skills.map((skill) => (
                          <div
                            key={skill.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Activity className="size-3 text-muted-foreground" />
                            <span className="font-medium">{skill.name}</span>
                            <span className="text-muted-foreground truncate">
                              {skill.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aggregate Stats */}
      {stats && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Aggregate Stats
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="text-center">
                <div className="text-xs text-muted-foreground">Requests</div>
                <div className="text-lg font-mono text-vigil">
                  {stats.totalRequests}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center">
                <div className="text-xs text-muted-foreground">Avg Latency</div>
                <div className="text-lg font-mono">{stats.avgLatency}ms</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center">
                <div className="text-xs text-muted-foreground">
                  Total Tokens
                </div>
                <div className="text-lg font-mono">
                  {stats.totalTokens.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="text-center">
                <div className="text-xs text-muted-foreground">Error Rate</div>
                <div
                  className={`text-lg font-mono ${stats.errorRate > 0.05 ? "text-red-400" : "text-green-400"}`}
                >
                  {(stats.errorRate * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Message Log */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Message Log
          </h4>
          <div className="space-y-2">
            {history.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="size-3 text-muted-foreground" />
                    <span className="font-mono text-xs">{entry.method}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${entry.statusCode < 400 ? "text-green-400" : "text-red-400"}`}
                    >
                      {entry.statusCode}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">{entry.latency}ms</span>
                    <span className="font-mono">{entry.tokens} tok</span>
                    <span>{new Date(entry.time).toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!statusLoading && !status && (
        <div className="text-sm text-muted-foreground text-center py-8">
          A2A server is not running.
        </div>
      )}
    </div>
  );
}
