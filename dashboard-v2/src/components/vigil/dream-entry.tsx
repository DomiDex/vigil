import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/cn";
import type { DreamResult } from "../../types/api";

export function shouldTruncate(summary: string): boolean {
  return summary.length > 100;
}

interface DreamEntryProps {
  dream: DreamResult;
}

export function DreamEntry({ dream }: DreamEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const truncated = shouldTruncate(dream.summary);
  const displaySummary =
    truncated && !expanded ? dream.summary.slice(0, 100) + "..." : dream.summary;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4" />
            {dream.repo}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {dream.observationsConsolidated} observations
            </Badge>
            <span className="text-xs text-muted-foreground">
              {Math.round(dream.confidence * 100)}% confidence
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{displaySummary}</p>
        {truncated && (
          <button
            className="text-xs text-primary flex items-center gap-1"
            onClick={() => setExpanded(!expanded)}
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
        {(expanded || !truncated) && (
          <div className="space-y-2">
            {dream.insights.length > 0 && (
              <div>
                <span className="text-xs font-medium">Insights</span>
                <ul className="text-xs text-muted-foreground list-disc pl-4">
                  {dream.insights.map((insight, i) => (
                    <li key={i}>{insight}</li>
                  ))}
                </ul>
              </div>
            )}
            {dream.patterns.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {dream.patterns.map((pattern) => (
                  <Badge key={pattern} variant="outline" className="text-xs">
                    {pattern}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {new Date(dream.timestamp).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}
