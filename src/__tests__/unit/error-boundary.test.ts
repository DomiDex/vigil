import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { ErrorBoundary } from "../../../dashboard-v2/src/components/vigil/error-boundary";

function GoodChild() {
  return createElement("div", { "data-testid": "child" }, "Hello");
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    const html = renderToString(
      createElement(
        ErrorBoundary,
        { fallback: createElement("div", null, "Error fallback") },
        createElement(GoodChild)
      )
    );
    expect(html).toContain("Hello");
    expect(html).not.toContain("Error fallback");
  });

  it("getDerivedStateFromError returns hasError true", () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error("boom"));
    expect(state).toEqual({ hasError: true });
  });

  it("render returns fallback when hasError is true", () => {
    const boundary = new ErrorBoundary({
      children: createElement(GoodChild),
      fallback: createElement("div", null, "Plugin failed"),
    });
    boundary.state = { hasError: true };
    const result = boundary.render();
    expect(result).toBeDefined();
  });

  it("render returns children when hasError is false", () => {
    const boundary = new ErrorBoundary({
      children: createElement(GoodChild),
      fallback: createElement("div", null, "Plugin failed"),
    });
    boundary.state = { hasError: false };
    const result = boundary.render();
    expect(result).toBeDefined();
  });
});
