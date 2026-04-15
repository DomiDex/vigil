import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, RefreshCw } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getAgents,
  getCurrentAgent,
  switchAgent,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";

interface Agent {
  name: string;
  systemPrompt: string;
  model?: string;
  description?: string;
}

interface CurrentAgentData {
  name: string;
  systemPrompt: string;
  model?: string;
}

export default function AgentsPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const {
    data: agentsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: vigilKeys.agents.all,
    queryFn: () => getAgents(),
  });

  const { data: currentData } = useQuery({
    queryKey: vigilKeys.agents.current,
    queryFn: () => getCurrentAgent(),
  });

  const agents = (agentsData as Agent[] | undefined) ?? [];
  const current = currentData as CurrentAgentData | undefined;

  const switchMut = useMutation({
    mutationFn: (agentName: string) => switchAgent({ data: { agentName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.agents.all });
      queryClient.invalidateQueries({ queryKey: vigilKeys.agents.current });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Agents</h3>
        <Badge variant="secondary" className="text-xs">
          {agents.length} available
        </Badge>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load agents: {error?.message}
        </div>
      )}

      {/* Current Agent */}
      {current && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Current Agent
          </h4>
          <Card className="border-vigil/30">
            <CardContent>
              <div className="flex items-start gap-3">
                <Bot className="size-5 text-vigil mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{current.name}</span>
                    <Badge variant="outline" className="text-[10px] text-green-400">
                      active
                    </Badge>
                    {current.model && (
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {current.model}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 font-mono">
                    {current.systemPrompt}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Available Agents */}
      {agents.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Available Agents
          </h4>
          <div className="space-y-2">
            {agents.map((agent) => {
              const isActive = current?.name === agent.name;
              return (
                <Card key={agent.name}>
                  <CardContent className="flex items-center justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Bot className="size-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {agent.name}
                          </span>
                          {agent.model && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-mono"
                            >
                              {agent.model}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {agent.description ?? agent.systemPrompt}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant={isActive ? "default" : "secondary"}
                      onClick={() => switchMut.mutate(agent.name)}
                      disabled={isActive || switchMut.isPending}
                    >
                      {isActive ? (
                        "Active"
                      ) : (
                        <>
                          <RefreshCw className="size-3 mr-1" />
                          Switch
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && agents.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No agents configured.
        </div>
      )}
    </div>
  );
}
