import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { DecisionBadge } from "./decision-badge";
import type { TimelineMessage } from "../../types/api";

export function TimelineEntry({ message }: { message: TimelineMessage }) {
  const [expanded, setExpanded] = useState(false);

  const decision = message.decision || "SILENT";
  const confidence = message.confidence;
  const repo = (message.source as Record<string, unknown>)?.repo as string | undefined;

  return (
    <Card className="bg-surface border-border hover:border-border-light transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <DecisionBadge decision={decision} />
              {repo && (
                <span className="text-xs font-mono text-muted-foreground">
                  {repo}
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(message.timestamp).toLocaleString()}
              </span>
              {confidence != null && (
                <span className="text-xs font-mono text-muted-foreground">
                  {Math.round(confidence * 100)}%
                </span>
              )}
            </div>

            <p className={expanded ? "mt-2 text-sm" : "mt-2 text-sm line-clamp-2"}>
              {message.message}
            </p>

            {expanded && (
              <div className="mt-3 space-y-3">
                <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto max-h-48">
                  {JSON.stringify(message.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
