import { describe, test, expect } from "bun:test";
import {
  isTaskFormValid,
  isWebhookFormValid,
  isSchedulerFormValid,
} from "../../src/lib/form-validation";

describe("Task form validation", () => {
  test("valid when title is provided", () => {
    expect(isTaskFormValid("Fix bug")).toBe(true);
  });

  test("invalid when title is empty", () => {
    expect(isTaskFormValid("")).toBe(false);
  });

  test("invalid when title is whitespace only", () => {
    expect(isTaskFormValid("   ")).toBe(false);
  });
});

describe("Webhook form validation", () => {
  test("valid when repo and at least one event type", () => {
    expect(isWebhookFormValid("vigil", ["push"])).toBe(true);
  });

  test("invalid when repo is empty", () => {
    expect(isWebhookFormValid("", ["push"])).toBe(false);
  });

  test("invalid when no event types selected", () => {
    expect(isWebhookFormValid("vigil", [])).toBe(false);
  });
});

describe("Scheduler form validation", () => {
  test("valid when all required fields provided", () => {
    expect(isSchedulerFormValid("nightly", "0 0 * * *", "dream")).toBe(true);
  });

  test("invalid when name is empty", () => {
    expect(isSchedulerFormValid("", "0 0 * * *", "dream")).toBe(false);
  });

  test("invalid when cron is empty", () => {
    expect(isSchedulerFormValid("nightly", "", "dream")).toBe(false);
  });

  test("invalid when action is empty", () => {
    expect(isSchedulerFormValid("nightly", "0 0 * * *", "")).toBe(false);
  });
});
