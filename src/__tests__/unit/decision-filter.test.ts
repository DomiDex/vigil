import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { DecisionFilter } from "../../../dashboard-v2/src/plugins/timeline/DecisionFilter";

describe("DecisionFilter", () => {
  it("renders all filter buttons (All, SILENT, OBSERVE, NOTIFY, ACT)", () => {
    const html = renderToString(
      createElement(DecisionFilter, { value: undefined, onChange: () => {} })
    );
    expect(html).toContain("All");
    expect(html).toContain("SILENT");
    expect(html).toContain("OBSERVE");
    expect(html).toContain("NOTIFY");
    expect(html).toContain("ACT");
  });

  it("renders with correct button count", () => {
    const html = renderToString(
      createElement(DecisionFilter, { value: undefined, onChange: () => {} })
    );
    // 5 buttons: All, SILENT, OBSERVE, NOTIFY, ACT
    const buttonCount = (html.match(/<button/g) || []).length;
    expect(buttonCount).toBe(5);
  });
});
