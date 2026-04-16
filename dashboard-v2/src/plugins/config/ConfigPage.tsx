import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, RotateCcw, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
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

function parseCommaSeparated(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinCommaSeparated(arr: string[]): string {
  return arr.join(", ");
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
  build: "bg-vigil/20 text-vigil-light",
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

  const serverConfig = configData as ConfigData | undefined;
  const features = (featuresData as FeatureGate[] | undefined) ?? [];

  const [config, setConfig] = useState<ConfigData | null>(null);
  const originalRef = useRef<ConfigData | null>(null);

  // Sync local state when server data arrives or refreshes
  useEffect(() => {
    if (serverConfig) {
      const snapshot = JSON.parse(JSON.stringify(serverConfig));
      setConfig(snapshot);
      originalRef.current = JSON.parse(JSON.stringify(serverConfig));
    }
  }, [serverConfig]);

  const isDirty = useMemo(() => {
    if (!config || !originalRef.current) return false;
    return JSON.stringify(config) !== JSON.stringify(originalRef.current);
  }, [config]);

  const updateMut = useMutation({
    mutationFn: (data: Record<string, any>) => updateConfig({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.config.all });
      toast.success("Config saved");
    },
    onError: (err: Error) => toast.error(`Failed to save config: ${err.message}`),
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

  const handleDiscard = () => {
    if (originalRef.current) {
      setConfig(JSON.parse(JSON.stringify(originalRef.current)));
    }
  };

  const updateField = (key: keyof ConfigData, value: number | string) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateActionGate = (
    key: keyof ConfigData["actionGates"],
    value: boolean | number | string[],
  ) => {
    setConfig((prev) =>
      prev
        ? { ...prev, actionGates: { ...prev.actionGates, [key]: value } }
        : prev,
    );
  };

  return (
    <div className="space-y-6 pb-16">
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
                    <div key={key} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {label}
                      </Label>
                      <Input
                        type="number"
                        value={config[key] as number}
                        onChange={(e) =>
                          updateField(key, Number(e.target.value))
                        }
                        className="h-8 font-mono text-sm"
                      />
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
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Tick Model
                    </Label>
                    <Input
                      type="text"
                      value={config.tickModel}
                      onChange={(e) => updateField("tickModel", e.target.value)}
                      className="h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Escalation Model
                    </Label>
                    <Input
                      type="text"
                      value={config.escalationModel}
                      onChange={(e) =>
                        updateField("escalationModel", e.target.value)
                      }
                      className="h-8 font-mono text-sm"
                    />
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Enabled
                    </Label>
                    <Switch
                      checked={config.actionGates.enabled}
                      onCheckedChange={(checked: boolean) =>
                        updateActionGate("enabled", checked)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Auto-Approve
                    </Label>
                    <Switch
                      checked={config.actionGates.autoApprove}
                      onCheckedChange={(checked: boolean) =>
                        updateActionGate("autoApprove", checked)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Confidence Threshold
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={config.actionGates.confidenceThreshold}
                      onChange={(e) =>
                        updateActionGate(
                          "confidenceThreshold",
                          Number(e.target.value),
                        )
                      }
                      className="h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Allowed Repos
                    </Label>
                    <Input
                      type="text"
                      value={joinCommaSeparated(
                        config.actionGates.allowedRepos,
                      )}
                      onChange={(e) =>
                        updateActionGate(
                          "allowedRepos",
                          parseCommaSeparated(e.target.value),
                        )
                      }
                      placeholder="repo1, repo2"
                      className="h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">
                      Allowed Actions
                    </Label>
                    <Input
                      type="text"
                      value={joinCommaSeparated(
                        config.actionGates.allowedActions,
                      )}
                      onChange={(e) =>
                        updateActionGate(
                          "allowedActions",
                          parseCommaSeparated(e.target.value),
                        )
                      }
                      placeholder="commit, push, tag"
                      className="h-8 font-mono text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Sticky Dirty Bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
          <div className="flex items-center justify-end gap-2 max-w-screen-xl mx-auto">
            <span className="text-sm text-muted-foreground mr-auto">
              Unsaved changes
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDiscard}
            >
              <RotateCcw className="size-3 mr-1" />
              Discard Changes
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMut.isPending}
            >
              {updateMut.isPending ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <Save className="size-3 mr-1" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
