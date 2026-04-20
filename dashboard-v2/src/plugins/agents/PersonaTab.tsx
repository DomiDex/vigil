import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import { getAgents, getCurrentAgent, switchAgent } from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "../../components/ui/sheet";

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

export default function PersonaTab() {
  const queryClient = useQueryClient();
  const [previewAgent, setPreviewAgent] = useState<Agent | null>(null);

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
      setPreviewAgent(null);
      toast.success("Agent switched");
    },
    onError: (err: Error) =>
      toast.error(`Failed to switch agent: ${err.message}`),
  });

  return (
    <div className="space-y-6 mt-4">
      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load agents: {error?.message}
        </div>
      )}

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
                    <Badge
                      variant="outline"
                      className="text-[10px] text-green-400"
                    >
                      active
                    </Badge>
                    {current.model && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono"
                      >
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

      {agents.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">
            Available Agents ({agents.length})
          </h4>
          <div className="space-y-2">
            {agents.map((agent) => {
              const isActive = current?.name === agent.name;
              return (
                <Card
                  key={agent.name}
                  className="cursor-pointer transition-colors hover:border-vigil/20"
                  onClick={() => setPreviewAgent(agent)}
                >
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
                          {isActive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-green-400"
                            >
                              active
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
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isActive) switchMut.mutate(agent.name);
                      }}
                      disabled={isActive || switchMut.isPending}
                    >
                      {switchMut.isPending &&
                      switchMut.variables === agent.name ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : isActive ? (
                        "Active"
                      ) : (
                        "Activate"
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

      <Sheet
        open={previewAgent !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewAgent(null);
        }}
      >
        <SheetContent side="right">
          {previewAgent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {previewAgent.name}
                  {previewAgent.model && (
                    <Badge variant="secondary" className="text-xs font-mono">
                      {previewAgent.model}
                    </Badge>
                  )}
                  {current?.name === previewAgent.name && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-green-400"
                    >
                      active
                    </Badge>
                  )}
                </SheetTitle>
                {previewAgent.description && (
                  <SheetDescription>{previewAgent.description}</SheetDescription>
                )}
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-4">
                <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  System Prompt
                </h4>
                <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/80 bg-muted/50 rounded-md p-3">
                  {previewAgent.systemPrompt}
                </pre>
              </div>

              <SheetFooter>
                <Button
                  className="w-full"
                  onClick={() => switchMut.mutate(previewAgent.name)}
                  disabled={
                    current?.name === previewAgent.name || switchMut.isPending
                  }
                >
                  {switchMut.isPending ? (
                    <>
                      <Loader2 className="size-3 mr-1 animate-spin" />
                      Switching...
                    </>
                  ) : current?.name === previewAgent.name ? (
                    "Already Active"
                  ) : (
                    "Activate"
                  )}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
