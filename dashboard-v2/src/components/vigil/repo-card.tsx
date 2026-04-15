import { Circle, Moon, Sparkles, GitBranch } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/cn";
import type { RepoListItem, DecisionDistribution } from "../../types/api";

const STATE_ICON_MAP: Record<string, string> = {
  active: "Circle",
  sleeping: "Moon",
  dreaming: "Sparkles",
};

const StateIconComponent: Record<string, typeof Circle> = {
  active: Circle,
  sleeping: Moon,
  dreaming: Sparkles,
};

export function getStateIcon(state: string): string {
  return STATE_ICON_MAP[state] ?? "Circle";
}

export function formatSha(sha: string): string {
  return sha.slice(0, 7);
}

export function computeDecisionPercentages(
  decisions: DecisionDistribution,
): Record<string, number> {
  const total = Object.values(decisions).reduce((a, b) => a + b, 0);
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(decisions)) {
    result[key] = total === 0 ? 0 : Math.round((value / total) * 100);
  }
  return result;
}

interface RepoCardProps {
  repo: RepoListItem;
  isSelected: boolean;
  onSelect: () => void;
}

export function RepoCard({ repo, isSelected, onSelect }: RepoCardProps) {
  const IconComponent = StateIconComponent[repo.state] ?? Circle;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors",
        isSelected && "border-primary",
      )}
      onClick={onSelect}
    >
      <CardContent className="flex items-center gap-3">
        <IconComponent className="size-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{repo.name}</span>
            {repo.dirty && (
              <Badge variant="outline" className="text-xs">
                dirty
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            <span>{repo.branch}</span>
            <span className="font-mono">{formatSha(repo.head)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
