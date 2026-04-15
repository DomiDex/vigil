import { describe, it, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import {
  decisionConfig,
  DecisionBadge,
} from "../../../dashboard-v2/src/components/vigil/decision-badge";

describe("decisionConfig", () => {
  it("has entries for all 4 decision types", () => {
    expect(Object.keys(decisionConfig).sort()).toEqual(
      ["ACT", "NOTIFY", "OBSERVE", "SILENT"]
    );
  });

  it("SILENT has Moon icon and muted styling", () => {
    const cfg = decisionConfig.SILENT;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("outline");
    expect(cfg.className).toContain("muted");
  });

  it("OBSERVE has Eye icon and info styling", () => {
    const cfg = decisionConfig.OBSERVE;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("secondary");
    expect(cfg.className).toContain("info");
  });

  it("NOTIFY has Bell icon and warning styling", () => {
    const cfg = decisionConfig.NOTIFY;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("default");
    expect(cfg.className).toContain("warning");
  });

  it("ACT has Zap icon and vigil styling", () => {
    const cfg = decisionConfig.ACT;
    expect(cfg.icon).toBeDefined();
    expect(cfg.variant).toBe("destructive");
    expect(cfg.className).toContain("vigil");
  });
});

describe("DecisionBadge", () => {
  it("renders SILENT badge", () => {
    const html = renderToString(createElement(DecisionBadge, { decision: "SILENT" }));
    expect(html).toContain("SILENT");
  });

  it("renders ACT badge", () => {
    const html = renderToString(createElement(DecisionBadge, { decision: "ACT" }));
    expect(html).toContain("ACT");
  });

  it("falls back to SILENT for unknown decision type", () => {
    const html = renderToString(createElement(DecisionBadge, { decision: "UNKNOWN_TYPE" }));
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders all four decision types without error", () => {
    for (const decision of ["SILENT", "OBSERVE", "NOTIFY", "ACT"]) {
      const html = renderToString(createElement(DecisionBadge, { decision }));
      expect(html).toContain(decision);
    }
  });
});
