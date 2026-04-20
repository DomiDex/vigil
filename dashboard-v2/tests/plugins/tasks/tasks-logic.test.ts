import { describe, test, expect } from "bun:test";
import {
  getTaskActions,
  describeWaitCondition,
} from "../../../src/plugins/tasks/TasksPage";

describe("getTaskActions", () => {
  test("pending tasks can be activated or cancelled", () => {
    expect(getTaskActions("pending")).toEqual(["activate", "cancel"]);
  });

  test("active tasks can be completed or cancelled", () => {
    expect(getTaskActions("active")).toEqual(["complete", "cancel"]);
  });

  test("waiting tasks can be activated or cancelled", () => {
    expect(getTaskActions("waiting")).toEqual(["activate", "cancel"]);
  });

  test("completed tasks have no actions", () => {
    expect(getTaskActions("completed")).toEqual([]);
  });

  test("failed tasks have no actions", () => {
    expect(getTaskActions("failed")).toEqual([]);
  });

  test("cancelled tasks have no actions", () => {
    expect(getTaskActions("cancelled")).toEqual([]);
  });
});

describe("describeWaitCondition", () => {
  test("null condition returns null", () => {
    expect(describeWaitCondition(null)).toBeNull();
  });

  test("event type shows event name", () => {
    expect(
      describeWaitCondition({ type: "event", eventType: "new_commit" }),
    ).toBe("waiting on new_commit");
  });

  test("event type with filter shows both", () => {
    expect(
      describeWaitCondition({ type: "event", eventType: "new_commit", filter: "main" }),
    ).toBe("waiting on new_commit (main)");
  });

  test("task dependency shows short id", () => {
    expect(
      describeWaitCondition({ type: "task", taskId: "12345678-abcd-efef-1111-222222222222" }),
    ).toBe("waiting on task 12345678");
  });

  test("schedule shows cron", () => {
    expect(describeWaitCondition({ type: "schedule", cron: "0 * * * *" })).toBe(
      "waiting on schedule 0 * * * *",
    );
  });
});
