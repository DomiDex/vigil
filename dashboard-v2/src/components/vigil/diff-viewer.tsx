import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/cn";

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  chunks: string;
}

type LineType = "addition" | "deletion" | "hunk" | "header" | "context";

function classifyLine(line: string): LineType {
  if (line.startsWith("diff --git")) return "header";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "addition";
  if (line.startsWith("-") && !line.startsWith("---")) return "deletion";
  return "context";
}

const LINE_STYLES: Record<LineType, string> = {
  addition: "text-green-400 bg-green-500/10",
  deletion: "text-red-400 bg-red-500/10",
  hunk: "text-blue-400 bg-blue-500/10",
  header: "text-muted-foreground font-medium",
  context: "text-muted-foreground",
};

function DiffFileSection({ file }: { file: DiffFile }) {
  const [open, setOpen] = useState(true);
  const lines = file.chunks.split("\n");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 rounded transition-colors">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="font-mono font-medium text-foreground">{file.path}</span>
        <span className="ml-auto flex items-center gap-2">
          {file.additions > 0 && (
            <span className="text-green-400">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-red-400">-{file.deletions}</span>
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-l-2 border-muted ml-1.5 pl-2">
          {lines.map((line, i) => {
            const type = classifyLine(line);
            return (
              <div
                key={i}
                className={cn(
                  "font-mono text-xs px-2 leading-5 whitespace-pre",
                  LINE_STYLES[type],
                )}
              >
                {line || "\u00A0"}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface DiffViewerProps {
  files: DiffFile[];
  truncated: boolean;
  stats?: { filesChanged: number; insertions: number; deletions: number };
}

export function DiffViewer({ files, truncated, stats }: DiffViewerProps) {
  if (files.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No changes in working tree.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {truncated && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 rounded text-xs text-yellow-400">
          <AlertTriangle className="size-3" />
          Diff truncated (exceeds 500KB). Some changes may not be shown.
        </div>
      )}

      {stats && (
        <div className="flex items-center gap-3 px-3 py-1 text-xs text-muted-foreground">
          <span>{stats.filesChanged} file{stats.filesChanged !== 1 ? "s" : ""} changed</span>
          <span className="text-green-400">+{stats.insertions}</span>
          <span className="text-red-400">-{stats.deletions}</span>
        </div>
      )}

      <ScrollArea className="max-h-[600px]">
        <div className="space-y-1">
          {files.map((file) => (
            <DiffFileSection key={file.path} file={file} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
