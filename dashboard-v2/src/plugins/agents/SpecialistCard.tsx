import { Play, Settings, Power, PowerOff } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { SpecialistSummary } from "../../types/api";
import { formatRelativeTime } from "./time";

interface SpecialistCardProps {
  specialist: SpecialistSummary;
  onToggle: (name: string, enabled: boolean) => void;
  onRun: (name: string) => void;
  onEdit: (name: string) => void;
  isToggling?: boolean;
  isRunning?: boolean;
}

function getClassBadgeColor(cls: string): string {
  return cls === "analytical" ? "text-blue-400" : "text-green-400";
}

export function SpecialistCard({
  specialist: s,
  onToggle,
  onRun,
  onEdit,
  isToggling,
  isRunning,
}: SpecialistCardProps) {
  return (
    <Card className={s.enabled ? "border-vigil/20" : "opacity-60"}>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{s.name}</span>
              <Badge
                variant="secondary"
                className={`text-[10px] ${getClassBadgeColor(s.class)}`}
              >
                {s.class}
              </Badge>
              {s.model && (
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {s.model}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {s.description}
            </p>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onToggle(s.name, !s.enabled)}
            disabled={isToggling}
            title={s.enabled ? "Disable" : "Enable"}
          >
            {s.enabled ? (
              <Power className="size-3.5 text-green-400" />
            ) : (
              <PowerOff className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{s.findingCount} findings</span>
          {s.lastRunAt && <span>last: {formatRelativeTime(s.lastRunAt)}</span>}
          {s.cooldownRemaining > 0 && (
            <span>cooldown: {s.cooldownRemaining}s</span>
          )}
        </div>

        {s.triggerEvents.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {s.triggerEvents.map((evt) => (
              <Badge key={evt} variant="outline" className="text-[10px]">
                {evt}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => onRun(s.name)}
            disabled={!s.enabled || isRunning || s.cooldownRemaining > 0}
          >
            <Play className="size-3 mr-1" />
            Run
          </Button>
          <Button size="xs" variant="secondary" onClick={() => onEdit(s.name)}>
            <Settings className="size-3 mr-1" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
