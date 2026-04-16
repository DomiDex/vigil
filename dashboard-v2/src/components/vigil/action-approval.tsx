import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Shield, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { cn } from "../../lib/cn";
import { getActionPreview } from "../../server/functions";
import { vigilKeys } from "../../lib/query-keys";
import type { ActionRequest, ActionPreview } from "../../types/api";

export function getTierBadgeClasses(tier: string): { bg: string; text: string } {
  switch (tier) {
    case "safe":
      return { bg: "bg-success/10", text: "text-success" };
    case "moderate":
      return { bg: "bg-warning/10", text: "text-warning" };
    case "dangerous":
      return { bg: "bg-error/10", text: "text-error" };
    default:
      return { bg: "bg-muted", text: "text-muted-foreground" };
  }
}

export function getGateIcon(value: boolean | undefined): string {
  if (value === true) return "CheckCircle";
  if (value === false) return "XCircle";
  return "Clock";
}

const GateIconComponent: Record<string, typeof CheckCircle> = {
  CheckCircle,
  XCircle,
  Clock,
};

export const GATE_LABEL_MAP: Record<string, string> = {
  configEnabled: "Config enabled",
  sessionOptedIn: "Session opted in",
  repoAllowed: "Repo in allowlist",
  actionTypeAllowed: "Action type allowed",
  confidenceMet: "Confidence >= threshold",
  userApproval: "User approval",
};

export const GATE_LABELS: string[] = Object.values(GATE_LABEL_MAP);

interface ActionApprovalProps {
  action: ActionRequest;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function ActionApproval({ action, onApprove, onReject }: ActionApprovalProps) {
  const [showPreview, setShowPreview] = useState(false);
  const tierClasses = getTierBadgeClasses(action.tier);
  const gateEntries = action.gateResults
    ? Object.entries(action.gateResults)
    : [];

  const preview = useQuery({
    queryKey: vigilKeys.actions.preview(action.id),
    queryFn: () => getActionPreview({ data: { id: action.id } }),
    enabled: showPreview,
    staleTime: 60_000,
  });
  const previewData = preview.data as ActionPreview | undefined;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="size-4" />
            {action.command}
          </CardTitle>
          <Badge className={cn(tierClasses.bg, tierClasses.text, "border-0")}>
            {action.tier}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">{action.reason}</div>
        <div className="text-xs">
          <span className="font-medium">Repo:</span>{" "}
          <span className="text-muted-foreground">{action.repo}</span>
        </div>
        <div className="text-xs">
          <span className="font-medium">Confidence:</span>{" "}
          <span className="text-muted-foreground">
            {Math.round(action.confidence * 100)}%
          </span>
        </div>

        {gateEntries.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium">Gates</span>
            {gateEntries.map(([key, value]) => {
              const iconName = getGateIcon(value as boolean | undefined);
              const Icon = GateIconComponent[iconName] ?? Clock;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <Icon className="size-3" />
                  <span className="text-muted-foreground">
                    {GATE_LABEL_MAP[key] ?? key}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {showPreview && (
          <div className="space-y-2 border-t pt-2">
            {preview.isLoading && <Skeleton className="h-20 w-full" />}
            {preview.isError && (
              <p className="text-xs text-muted-foreground">Preview unavailable</p>
            )}
            {previewData && (
              <>
                <p className="text-sm">{previewData.description}</p>
                {previewData.dryRun && (
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                    {previewData.dryRun}
                  </pre>
                )}
                {previewData.estimatedEffect && (
                  <p className="text-xs text-muted-foreground">
                    {previewData.estimatedEffect}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {action.status === "pending" && (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowPreview((v) => !v)}
            >
              <Eye className="size-3 mr-1" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => onApprove?.(action.id)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onReject?.(action.id)}
            >
              Reject
            </Button>
          </div>
        )}

        {action.timeRelative && (
          <div className="text-xs text-muted-foreground">
            {action.timeRelative}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
