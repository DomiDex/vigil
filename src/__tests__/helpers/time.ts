import { spyOn } from "bun:test";

export function freezeTime(timestamp: number) {
  return spyOn(Date, "now").mockReturnValue(timestamp);
}

export function advanceTime(ms: number) {
  const now = Date.now();
  return spyOn(Date, "now").mockReturnValue(now + ms);
}
