import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createFakeDashboardContext } from "../helpers/dashboard-v2-helpers.ts";

describe("server functions -- mutations", () => {
  let ctxSpy: ReturnType<typeof spyOn>;
  let fakeCtx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(async () => {
    fakeCtx = createFakeDashboardContext();
    const vigilCtxMod = await import("../../../dashboard-v2/src/server/vigil-context.ts");
    ctxSpy = spyOn(vigilCtxMod, "getVigilContext").mockReturnValue(fakeCtx as any);
  });

  afterEach(() => {
    ctxSpy.mockRestore();
  });

  describe("triggerDream", () => {
    it("calls handleDreamTrigger with context and repo", async () => {
      const dreamsMod = await import("../../dashboard/api/dreams.ts");
      const handlerSpy = spyOn(dreamsMod, "handleDreamTrigger").mockResolvedValue("<div>ok</div>");

      const { triggerDream } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await triggerDream({ data: { repo: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("vigil");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("createTask", () => {
    it("calls handleTaskCreate with context and FormData", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "handleTaskCreate").mockReturnValue("<div>created</div>");

      const { createTask } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await createTask({
        data: { title: "Test task", description: "A test", repo: "vigil" },
      });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      const formData = handlerSpy.mock.calls[0][1];
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get("title")).toBe("Test task");
      expect(formData.get("description")).toBe("A test");
      expect(formData.get("repo")).toBe("vigil");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("activateTask", () => {
    it("calls handleTaskActivate with context and id", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "handleTaskActivate").mockReturnValue("<div>activated</div>");

      const { activateTask } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await activateTask({ data: { id: "task-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("task-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("completeTask", () => {
    it("calls handleTaskComplete with context and id", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "handleTaskComplete").mockReturnValue("<div>completed</div>");

      const { completeTask } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await completeTask({ data: { id: "task-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("task-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("failTask", () => {
    it("calls handleTaskFail with context and id", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "handleTaskFail").mockReturnValue("<div>failed</div>");

      const { failTask } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await failTask({ data: { id: "task-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("task-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("updateTask", () => {
    it("calls handleTaskUpdate with context, id, and FormData", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "handleTaskUpdate").mockReturnValue("<div>updated</div>");

      const { updateTask } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await updateTask({
        data: { id: "task-123", title: "Updated", description: "New desc" },
      });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("task-123");
      const formData = handlerSpy.mock.calls[0][2];
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get("title")).toBe("Updated");
      expect(formData.get("description")).toBe("New desc");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("cancelTask", () => {
    it("calls handleTaskCancel with context and id", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "handleTaskCancel").mockReturnValue("<div>cancelled</div>");

      const { cancelTask } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await cancelTask({ data: { id: "task-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("task-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("approveAction", () => {
    it("calls handleApprove with context and id", async () => {
      const actionsMod = await import("../../dashboard/api/actions.ts");
      const handlerSpy = spyOn(actionsMod, "handleApprove").mockResolvedValue("<div>approved</div>");

      const { approveAction } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await approveAction({ data: { id: "action-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("action-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("rejectAction", () => {
    it("calls handleReject with context and id", async () => {
      const actionsMod = await import("../../dashboard/api/actions.ts");
      const handlerSpy = spyOn(actionsMod, "handleReject").mockReturnValue("<div>rejected</div>");

      const { rejectAction } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await rejectAction({ data: { id: "action-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("action-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("askVigil", () => {
    it("calls handleAsk with context, question, and optional repo", async () => {
      const memoryMod = await import("../../dashboard/api/memory.ts");
      const handlerSpy = spyOn(memoryMod, "handleAsk").mockResolvedValue("<div>The answer is 42</div>");

      const { askVigil } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await askVigil({
        data: { question: "What happened?", repo: "vigil" },
      });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("What happened?");
      expect(handlerSpy.mock.calls[0][2]).toBe("vigil");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("createSchedule", () => {
    it("calls handleSchedulerCreate with context and FormData", async () => {
      const schedulerMod = await import("../../dashboard/api/scheduler.ts");
      const handlerSpy = spyOn(schedulerMod, "handleSchedulerCreate").mockResolvedValue("<div>created</div>");

      const { createSchedule } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await createSchedule({
        data: { name: "nightly", cron: "0 0 * * *", action: "dream", repo: "vigil" },
      });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      const formData = handlerSpy.mock.calls[0][1];
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get("name")).toBe("nightly");
      expect(formData.get("cron")).toBe("0 0 * * *");
      expect(formData.get("action")).toBe("dream");
      expect(formData.get("repo")).toBe("vigil");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("deleteSchedule", () => {
    it("calls handleSchedulerDelete with context and id", async () => {
      const schedulerMod = await import("../../dashboard/api/scheduler.ts");
      const handlerSpy = spyOn(schedulerMod, "handleSchedulerDelete").mockReturnValue("<div>deleted</div>");

      const { deleteSchedule } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await deleteSchedule({ data: { id: "sched-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("sched-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });

  describe("triggerSchedule", () => {
    it("calls handleSchedulerTrigger with context and id", async () => {
      const schedulerMod = await import("../../dashboard/api/scheduler.ts");
      const handlerSpy = spyOn(schedulerMod, "handleSchedulerTrigger").mockResolvedValue("<div>triggered</div>");

      const { triggerSchedule } = await import("../../../dashboard-v2/src/server/functions.ts");

      const result = await triggerSchedule({ data: { id: "sched-123" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("sched-123");
      expect(result).toEqual({ success: true });

      handlerSpy.mockRestore();
    });
  });
});
