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
    const interval = setInterval(() => {
      setSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextTickIn]);

  return (
    <span className="font-mono tabular-nums text-sm text-text-muted">
      {seconds > 0 ? `${seconds}s` : "now"}
    </span>
  );
}
