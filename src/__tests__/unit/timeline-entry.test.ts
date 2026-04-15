import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { TimelineEntry } from "../../../dashboard-v2/src/components/vigil/timeline-entry";
import type { TimelineMessage } from "../../../dashboard-v2/src/types/api";

function createFakeMessage(overrides?: Partial<TimelineMessage>): TimelineMessage {
  return {
    id: "msg-001",
    message: "Detected 3 new commits in vigil repo. Changes to src/llm/ suggest model routing updates.",
    source: { repo: "vigil" },
    timestamp: "2026-04-15T10:30:00Z",
    status: "normal",
    severity: "info",
    decision: "OBSERVE",
    confidence: 0.85,
    metadata: { tick: 42 },
    attachments: {},
    ...overrides,
  };
}

describe("TimelineEntry", () => {
  it("renders collapsed entry with line-clamp-2", () => {
    const html = renderToString(
      createElement(TimelineEntry, { message: createFakeMessage() })
    );
    expect(html).toContain("line-clamp-2");
  });

  it("renders decision badge for message decision type", () => {
    const html = renderToString(
      createElement(TimelineEntry, { message: createFakeMessage({ decision: "ACT" }) })
    );
    expect(html).toContain("ACT");
  });

  it("renders repo name from message source", () => {
    const html = renderToString(
      createElement(TimelineEntry, { message: createFakeMessage() })
    );
    expect(html).toContain("vigil");
  });

  it("renders confidence percentage", () => {
    const html = renderToString(
      createElement(TimelineEntry, { message: createFakeMessage({ confidence: 0.85 }) })
    );
    // React SSR inserts comment nodes between adjacent text: "85<!-- -->%"
    expect(html).toContain("85");
  });

  it("renders timestamp", () => {
    const html = renderToString(
      createElement(TimelineEntry, { message: createFakeMessage() })
    );
    // toLocaleString renders differently per environment; just verify timestamp region present
    expect(html).toContain("2026");
  });

  it("defaults to SILENT when no decision in metadata", () => {
    const html = renderToString(
      createElement(TimelineEntry, { message: createFakeMessage({ decision: "" }) })
    );
    expect(html).toContain("SILENT");
  });
});
