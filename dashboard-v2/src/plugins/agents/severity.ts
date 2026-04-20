import type { FindingSeverity } from "../../types/api";

export function severityClasses(sev: FindingSeverity): string {
  if (sev === "critical") return "text-red-400 bg-red-400/10 border-0";
  if (sev === "warning") return "text-yellow-400 bg-yellow-400/10 border-0";
  return "text-blue-400 bg-blue-400/10 border-0";
}
