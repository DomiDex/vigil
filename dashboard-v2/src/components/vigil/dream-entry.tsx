import { useState } from "react";
import { ChevronDown, ChevronUp, Moon, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { formatRelativeTime } from "../../plugins/agents/time";
import { cn } from "../../lib/cn";
import type { DreamResult } from "../../types/api";

export function shouldTruncate(summary: string): boolean {
  return summary.length > 180;
}

function confidenceTone(confidence: number): string {
  if (confidence >= 0.75) return "text-success";
  if (confidence >= 0.5) return "text-vigil";
  return "text-muted-foreground";
}

interface DreamEntryProps {
  dream: DreamResult;
}

export function DreamEntry({ dream }: DreamEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const truncated = shouldTruncate(dream.summary);
  const displaySummary =
    truncated && !expanded ? dream.summary.slice(0, 180) + "…" : dream.summary;
  const confidencePct = Math.round(dream.confidence * 100);
  const hasInsights = dream.insights.length > 0;
  const hasPatterns = dream.patterns.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Moon className="size-4 text-vigil shrink-0" />
            <span className="text-sm font-medium truncate">{dream.repo}</span>
            <Badge variant="secondary" className="text-xs">
              {dream.observationsConsolidated} obs
            </Badge>
          </div>
          <span
            className="text-xs text-muted-foreground whitespace-nowrap"
            title={new Date(dream.timestamp).toLocaleString()}
          >
            {formatRelativeTime(dream.timestamp)}
          </span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                dream.confidence >= 0.75
                  ? "bg-success"
                  : dream.confidence >= 0.5
                    ? "bg-vigil"
                    : "bg-muted-foreground/40",
              )}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span
            className={cn(
              "text-xs font-medium tabular-nums w-10 text-right",
              confidenceTone(dream.confidence),
            )}
          >
            {confidencePct}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-foreground/90 leading-relaxed">
          {displaySummary}
        </p>
        {truncated && (
          <button
            type="button"
            className="text-xs text-vigil hover:underline flex items-center gap-1"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-3" /> Show more
              </>
            )}
          </button>
        )}
        {hasPatterns && (
          <div className="flex flex-wrap gap-1">
            {dream.patterns.map((pattern) => (
              <Badge key={pattern} variant="outline" className="text-xs">
                {pattern}
              </Badge>
            ))}
          </div>
        )}
        {hasInsights && (
          <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lightbulb className="size-3" />
              Insights
            </div>
            <ul className="text-xs text-foreground/80 list-disc pl-4 space-y-0.5">
              {dream.insights.map((insight, i) => (
                <li key={i}>{insight}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
