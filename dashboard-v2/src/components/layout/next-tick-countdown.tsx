import { useState, useEffect } from "react";

interface NextTickCountdownProps {
  nextTickIn: number;
}

export function NextTickCountdown({ nextTickIn }: NextTickCountdownProps) {
  const [seconds, setSeconds] = useState(Math.max(0, Math.round(nextTickIn)));

  useEffect(() => {
    setSeconds(Math.max(0, Math.round(nextTickIn)));
  }, [nextTickIn]);

  useEffect(() => {
    if (seconds <= 0) return;

    const interval = setInterval(() => {
      setSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds]);

  return (
    <span className="font-mono tabular-nums text-sm text-text-muted">
      {seconds > 0 ? `${seconds}s` : "now"}
    </span>
  );
}
