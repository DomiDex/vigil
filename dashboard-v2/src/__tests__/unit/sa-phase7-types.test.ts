import { describe, test, expect } from "bun:test";
import type {
  SpecialistClass,
  FindingSeverity,
  SpecialistSummary,
  SpecialistsListResponse,
  SpecialistDetailResponse,
  FindingItem,
  FindingDetailResponse,
  FindingsListResponse,
  FlakyTestItem,
  FlakyTestsResponse,
} from "../../types/api";

describe("specialist dashboard types", () => {
  test("SpecialistClass accepts valid values", () => {
    const classes: SpecialistClass[] = ["deterministic", "analytical"];
    expect(classes).toHaveLength(2);
  });

  test("FindingSeverity accepts valid values", () => {
    const severities: FindingSeverity[] = ["info", "warning", "critical"];
    expect(severities).toHaveLength(3);
  });

  test("SpecialistSummary has required fields", () => {
    const summary: SpecialistSummary = {
      name: "security",
      class: "analytical",
      description: "Scans for security issues",
      enabled: true,
      triggerEvents: ["new_commit"],
      watchPatterns: ["*.ts"],
      findingCount: 5,
      lastRunAt: "2026-04-15T10:00:00Z",
      lastRunRepo: "vigil",
      cooldownRemaining: 0,
    };
    expect(summary.name).toBe("security");
    expect(summary.model).toBeUndefined();
  });

  test("SpecialistSummary model field is optional", () => {
    const summary: SpecialistSummary = {
      name: "fmt",
      class: "deterministic",
      description: "Formatter",
      enabled: false,
      model: "haiku",
      triggerEvents: ["file_change"],
      watchPatterns: [],
      findingCount: 0,
      lastRunAt: null,
      lastRunRepo: null,
      cooldownRemaining: 0,
    };
    expect(summary.model).toBe("haiku");
  });

  test("FindingItem has required fields", () => {
    const finding: FindingItem = {
      id: "f1",
      specialist: "security",
      severity: "critical",
      title: "Hardcoded API key",
      repo: "vigil",
      createdAt: "2026-04-15T10:00:00Z",
      dismissed: false,
    };
    expect(finding.id).toBe("f1");
    expect(finding.file).toBeUndefined();
    expect(finding.line).toBeUndefined();
  });

  test("FindingDetailResponse extends FindingItem with detail fields", () => {
    const detail: FindingDetailResponse = {
      id: "f1",
      specialist: "security",
      severity: "critical",
      title: "Hardcoded API key",
      repo: "vigil",
      createdAt: "2026-04-15T10:00:00Z",
      dismissed: false,
      detail: "Found exposed key in config.ts line 42",
      confidence: 0.95,
    };
    expect(detail.detail).toBeDefined();
    expect(detail.suggestion).toBeUndefined();
    expect(detail.diff).toBeUndefined();
  });

  test("SpecialistsListResponse has specialists array and globalConfig", () => {
    const response: SpecialistsListResponse = {
      specialists: [],
      globalConfig: {
        enabled: true,
        maxParallel: 2,
        cooldownSeconds: 300,
        severityThreshold: "info",
      },
    };
    expect(response.specialists).toHaveLength(0);
    expect(response.globalConfig.enabled).toBe(true);
  });

  test("SpecialistDetailResponse has config, recentFindings, stats", () => {
    const response: SpecialistDetailResponse = {
      config: {
        name: "security",
        class: "analytical",
        description: "",
        enabled: true,
        triggerEvents: ["new_commit"],
        watchPatterns: [],
        findingCount: 0,
        lastRunAt: null,
        lastRunRepo: null,
        cooldownRemaining: 0,
        cooldownSeconds: 300,
        severityThreshold: "info",
      },
      recentFindings: [],
      stats: {
        totalFindings: 0,
        bySeverity: { info: 0, warning: 0, critical: 0 },
        avgConfidence: 0,
        lastWeekFindings: 0,
      },
    };
    expect(response.stats.totalFindings).toBe(0);
    expect(response.stats.bySeverity.critical).toBe(0);
  });

  test("FindingsListResponse has pagination fields", () => {
    const response: FindingsListResponse = {
      findings: [],
      total: 0,
      page: 1,
      hasMore: false,
    };
    expect(response.total).toBe(0);
    expect(response.hasMore).toBe(false);
  });

  test("FlakyTestItem has required fields", () => {
    const item: FlakyTestItem = {
      testName: "test > foo",
      testFile: "foo.test.ts",
      repo: "vigil",
      totalRuns: 10,
      passRate: 0.8,
      flakyCommits: 2,
      isDefinitive: true,
      lastFlakyAt: "2026-04-15T10:00:00Z",
      status: "flaky",
    };
    expect(item.status).toBe("flaky");
  });

  test("FlakyTestsResponse has tests array and summary", () => {
    const response: FlakyTestsResponse = {
      tests: [],
      summary: {
        totalTracked: 0,
        flakyCount: 0,
        stableCount: 0,
        insufficientData: 0,
      },
    };
    expect(response.summary.totalTracked).toBe(0);
  });
});
