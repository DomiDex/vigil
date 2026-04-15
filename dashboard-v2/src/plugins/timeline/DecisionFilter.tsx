import { Button } from "../../components/ui/button";

const DECISIONS = ["SILENT", "OBSERVE", "NOTIFY", "ACT"] as const;

interface DecisionFilterProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

export function DecisionFilter({ value, onChange }: DecisionFilterProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Button
        variant={value === undefined ? "default" : "secondary"}
        size="xs"
        onClick={() => onChange(undefined)}
      >
        All
      </Button>
      {DECISIONS.map((d) => (
        <Button
          key={d}
          variant={value === d ? "default" : "secondary"}
          size="xs"
          onClick={() => onChange(d)}
        >
          {d}
        </Button>
      ))}
    </div>
  );
}
