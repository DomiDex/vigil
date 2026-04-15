import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, RotateCcw, Save } from "lucide-react";
import { vigilKeys } from "../../lib/query-keys";
import {
  getConfig,
  updateConfig,
  getFeatureGates,
  toggleFeatureGate,
} from "../../server/functions";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { WidgetProps } from "../../types/plugin";

interface FeatureGate {
  key: string;
  name: string;
  enabled: boolean;
  layers: Record<string, boolean>;
}

interface ConfigData {
  tickInterval: number;
  sleepAfter: number;
  sleepTickInterval: number;
  dreamAfter: number;
  blockingBudget: number;
  maxEventWindow: number;
  tickModel: string;
  escalationModel: string;
  actionGates: {
    enabled: boolean;
    autoApprove: boolean;
    confidenceThreshold: number;
    allowedRepos: string[];
    allowedActions: string[];
  };
}

const TICK_FIELDS: { key: keyof ConfigData; label: string }[] = [
  { key: "tickInterval", label: "Tick Interval" },
  { key: "sleepAfter", label: "Sleep After" },
  { key: "sleepTickInterval", label: "Sleep Tick Interval" },
  { key: "dreamAfter", label: "Dream After" },
  { key: "blockingBudget", label: "Blocking Budget" },
  { key: "maxEventWindow", label: "Max Event Window" },
];

const LAYER_VARIANTS: Record<string, string> = {
  build: "bg-blue-500/20 text-blue-400",
  config: "bg-purple-500/20 text-purple-400",
  runtime: "bg-amber-500/20 text-amber-400",
  session: "bg-cyan-500/20 text-cyan-400",
};

export default function ConfigPage({
  activeRepo,
}: Partial<WidgetProps> = {}) {
  const queryClient = useQueryClient();

  const { data: configData, isLoading, isError, error } = useQuery({
    queryKey: vigilKeys.config.all,
    queryFn: () => getConfig(),
  });

  const { data: featuresData } = useQuery({
    queryKey: vigilKeys.config.features,
    queryFn: () => getFeatureGates(),
  });

  const config = configData as ConfigData | undefined;
  const features = (featuresData as FeatureGate[] | undefined) ?? [];

  const updateMut = useMutation({
    mutationFn: (data: Record<string, any>) => updateConfig({ data }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.config.all }),
  });

  const toggleMut = useMutation({
    mutationFn: (gate: { name: string; enabled: boolean }) =>
      toggleFeatureGate({ data: gate }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: vigilKeys.config.features }),
  });

  const handleSave = () => {
    if (config) {
      updateMut.mutate(config);
    }
  };

  const handleReset = () => {
    queryClient.invalidateQueries({ queryKey: vigilKeys.config.all });
    queryClient.invalidateQueries({ queryKey: vigilKeys.config.features });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="size-4 text-vigil" />
        <h3 className="text-sm font-medium">Configuration</h3>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive p-4">
          Failed to load config: {error?.message}
        </div>
      )}

      {config && (
        <>
          {/* Tick Settings */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Tick Settings
            </h4>
            <Card>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {TICK_FIELDS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {label}
                      </div>
                      <div className="text-sm font-mono">
                        {String(config[key])}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Model Selection */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Model Selection
            </h4>
            <Card>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Tick Model
                    </div>
                    <div className="text-sm font-mono">
                      {config.tickModel}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Escalation Model
                    </div>
                    <div className="text-sm font-mono">
                      {config.escalationModel}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Feature Gates */}
          {features.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Feature Gates
              </h4>
              <Card>
                <CardContent>
                  <div className="space-y-3">
                    {features.map((gate) => (
                      <div
                        key={gate.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono">
                            {gate.name}
                          </span>
                          <div className="flex gap-1">
                            {gate.layers && typeof gate.layers === "object" &&
                              Object.entries(gate.layers).map(([layer, value]) => (
                                <Badge
                                  key={layer}
                                  variant="outline"
                                  className={`text-[10px] ${value ? (LAYER_VARIANTS[layer] ?? "") : "bg-red-500/20 text-red-400 line-through"}`}
                                >
                                  {layer}
                                </Badge>
                              ))}
                          </div>
                        </div>
                        <Button
                          size="xs"
                          variant={gate.enabled ? "default" : "secondary"}
                          className={
                            gate.enabled
                              ? "bg-green-600 hover:bg-green-700 text-white"
                              : "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                          }
                          onClick={() =>
                            toggleMut.mutate({
                              name: gate.name,
                              enabled: !gate.enabled,
                            })
                          }
                          disabled={toggleMut.isPending}
                        >
                          {gate.enabled ? "ON" : "OFF"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Action Gates */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Action Gates
            </h4>
            <Card>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Enabled
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        config.actionGates.enabled
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {config.actionGates.enabled ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Auto-Approve
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        config.actionGates.autoApprove
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {config.actionGates.autoApprove ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Confidence Threshold
                    </div>
                    <div className="text-sm font-mono">
                      {config.actionGates.confidenceThreshold}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Allowed Repos
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {config.actionGates.allowedRepos.length > 0 ? (
                        config.actionGates.allowedRepos.map((r) => (
                          <Badge
                            key={r}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {r}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          All
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Allowed Actions
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {config.actionGates.allowedActions.length > 0 ? (
                        config.actionGates.allowedActions.map((a) => (
                          <Badge
                            key={a}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {a}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          All
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleReset}
            >
              <RotateCcw className="size-3 mr-1" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMut.isPending}
            >
              <Save className="size-3 mr-1" />
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
