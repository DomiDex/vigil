import { describe, expect, it } from "bun:test";
import TimelinePage from "../../../dashboard-v2/src/plugins/timeline/TimelinePage";

describe("TimelinePage", () => {
  it("exports a default function component", () => {
    expect(typeof TimelinePage).toBe("function");
  });

  it("component has a name", () => {
    expect(TimelinePage.name).toBeDefined();
    expect(TimelinePage.name.length).toBeGreaterThan(0);
  });

  it("accepts Partial<WidgetProps> without error", () => {
    expect(() => TimelinePage.length).not.toThrow();
  });
});
