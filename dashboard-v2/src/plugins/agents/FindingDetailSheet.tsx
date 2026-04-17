import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Info, Loader2, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { vigilKeys } from "../../lib/query-keys";
import {
  createActionFromFinding,
  dismissFinding,
  getSpecialistFindingDetail,
} from "../../server/functions";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import type { FindingDetailResponse, FindingSeverity } from "../../types/api";

interface FindingDetailSheetProps {
  findingId: string | null;
  open: boolean;
  onClose: () => void;
}

function severityClasses(sev: FindingSeverity): string {
  if (sev === "critical") return "text-red-400 bg-red-400/10 border-0";
  if (sev === "warning") return "text-yellow-400 bg-yellow-400/10 border-0";
  return "text-blue-400 bg-blue-400/10 border-0";
}

function SeverityIcon({ sev }: { sev: FindingSeverity }) {
  if (sev === "critical") return <AlertTriangle className="size-4" />;
  if (sev === "warning") return <Shield className="size-4" />;
  return <Info className="size-4" />;
}

export function FindingDetailSheet({
  findingId,
  open,
  onClose,
}: FindingDetailSheetProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [ignorePattern, setIgnorePattern] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: vigilKeys.specialists.findingDetail(findingId ?? ""),
    queryFn: () => getSpecialistFindingDetail({ data: { id: findingId! } }),
    enabled: !!findingId && open,
  });
  const finding = data as FindingDetailResponse | undefined;

  const dismissMut = useMutation({
    mutationFn: (pattern?: string) =>
      dismissFinding({
        data: { id: findingId!, ignorePattern: pattern || undefined },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialists", "findings"] });
      queryClient.invalidateQueries({ queryKey: vigilKeys.specialists.all });
      toast.success("Finding dismissed");
      setIgnorePattern("");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const actionMut = useMutation({
    mutationFn: () =>
      createActionFromFinding({ data: { id: findingId! } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vigilKeys.actions.all });
      toast.success("Action created");
      onClose();
      navigate({ to: "/actions" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {finding && (
              <Badge className={severityClasses(finding.severity)}>
                <SeverityIcon sev={finding.severity} />
                <span className="ml-1">{finding.severity}</span>
              </Badge>
            )}
            <span className="text-sm">{finding?.title ?? "Loading..."}</span>
          </SheetTitle>
          {finding && (
            <SheetDescription>
              <span className="font-mono text-xs">
                {finding.specialist}
              </span>{" "}
              · {finding.repo}
              {finding.file && (
                <>
                  {" "}
                  ·{" "}
                  <span className="font-mono">
                    {finding.file}
                    {finding.line ? `:${finding.line}` : ""}
                  </span>
                </>
              )}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4">
          {isLoading && (
            <div className="text-xs text-muted-foreground">Loading...</div>
          )}

          {finding && (
            <>
              <section className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">
                  Detail
                </h4>
                <p className="text-sm whitespace-pre-wrap">{finding.detail}</p>
              </section>

              {finding.suggestion && (
                <section className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">
                    Suggestion
                  </h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {finding.suggestion}
                  </p>
                </section>
              )}

              {finding.diff && (
                <section className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">
                    Diff
                  </h4>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/80 bg-muted/50 rounded-md p-3 overflow-x-auto">
                    {finding.diff}
                  </pre>
                </section>
              )}

              <section className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase">
                  Ignore Pattern (optional)
                </h4>
                <Input
                  value={ignorePattern}
                  onChange={(e) => setIgnorePattern(e.target.value)}
                  placeholder="e.g. src/generated/**"
                />
              </section>

              <div className="text-[11px] text-muted-foreground">
                Confidence: {Math.round(finding.confidence * 100)}% ·{" "}
                {finding.createdAt}
              </div>
            </>
          )}
        </div>

        <SheetFooter>
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dismissMut.mutate(undefined)}
              disabled={dismissMut.isPending || !finding}
            >
              {dismissMut.isPending && dismissMut.variables === undefined ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : null}
              Dismiss
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dismissMut.mutate(ignorePattern)}
              disabled={
                dismissMut.isPending || !finding || !ignorePattern.trim()
              }
            >
              Dismiss & Ignore Pattern
            </Button>
            <Button
              size="sm"
              onClick={() => actionMut.mutate()}
              disabled={actionMut.isPending || !finding}
            >
              {actionMut.isPending ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <Zap className="size-3 mr-1" />
              )}
              Create Action
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
