import { Button } from "../../components/ui/button";

const DECISIONS = ["SILENT", "OBSERVE", "NOTIFY", "ACT"] as const;

interface DecisionFilterProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

export function DecisionFilter({ value, onChange }: DecisionFilterProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          value === undefined
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        All
      </button>
      {DECISIONS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === d
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
