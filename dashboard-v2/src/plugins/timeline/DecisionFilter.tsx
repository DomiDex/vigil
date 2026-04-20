import { Layers } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { decisionConfig } from "../../components/vigil/decision-badge";

const DECISIONS = ["SILENT", "OBSERVE", "NOTIFY", "ACT"] as const;

interface DecisionFilterProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

export function DecisionFilter({ value, onChange }: DecisionFilterProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Button
        variant={value === undefined ? "default" : "secondary"}
        size="xs"
        onClick={() => onChange(undefined)}
        className="gap-1"
        aria-pressed={value === undefined}
      >
        <Layers className="size-3" />
        All
      </Button>
      {DECISIONS.map((d) => {
        const cfg = decisionConfig[d];
        const Icon = cfg.icon;
        const active = value === d;
        return (
          <Button
            key={d}
            variant={active ? "default" : "secondary"}
            size="xs"
            onClick={() => onChange(d)}
            aria-pressed={active}
            className={cn("gap-1", active ? cfg.className : undefined)}
          >
            <Icon className="size-3" />
            {d}
          </Button>
        );
      })}
    </div>
  );
}
