import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { ReplyForm } from "../../../dashboard-v2/src/plugins/timeline/ReplyForm";

describe("ReplyForm", () => {
  it("renders textarea and submit button", () => {
    const html = renderToString(
      createElement(ReplyForm, { messageId: "msg-001" })
    );
    expect(html).toContain("textarea");
    expect(html).toContain("button");
  });

  it("renders with message id context", () => {
    // Component should accept messageId prop without error
    const html = renderToString(
      createElement(ReplyForm, { messageId: "msg-test-123" })
    );
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });
});
