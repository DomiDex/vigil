import { Moon, Eye, Bell, Zap, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/badge";

interface DecisionConfig {
  icon: LucideIcon;
  variant: "outline" | "secondary" | "default" | "destructive";
  className: string;
}

export const decisionConfig: Record<string, DecisionConfig> = {
  SILENT: {
    icon: Moon,
    variant: "outline",
    className: "text-muted-foreground border-border",
  },
  OBSERVE: {
    icon: Eye,
    variant: "secondary",
    className: "text-info bg-info/10",
  },
  NOTIFY: {
    icon: Bell,
    variant: "default",
    className: "text-warning bg-warning/10",
  },
  ACT: {
    icon: Zap,
    variant: "destructive",
    className: "text-vigil bg-vigil/10",
  },
};

export function DecisionBadge({ decision }: { decision: string }) {
  const config = decisionConfig[decision] ?? decisionConfig.SILENT;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className="size-3" />
      {decision in decisionConfig ? decision : "SILENT"}
    </Badge>
  );
}
