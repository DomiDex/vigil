import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

// Server functions now use fetch("/api/...") for mutations.
// Mutation endpoints return HTML (HTMX legacy), so functions use apiMutate
// which returns { success: true } without parsing the body.

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("<div>ok</div>", { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("server functions -- mutations", () => {
  describe("triggerDream", () => {
    it("POSTs to /api/dreams/trigger with repo in FormData", async () => {
      const { triggerDream } = await import("../../../dashboard-v2/src/server/functions.ts");
      const result = await triggerDream({ data: { repo: "vigil" } });
      expect(result).toEqual({ success: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/dreams/trigger");
      expect(init.method).toBe("POST");
    });
  });

  describe("createTask", () => {
    it("POSTs to /api/tasks with FormData fields", async () => {
      const { createTask } = await import("../../../dashboard-v2/src/server/functions.ts");
      const result = await createTask({
        data: { title: "Test task", description: "A test", repo: "vigil" },
      });
      expect(result).toEqual({ success: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/tasks");
      expect(init.method).toBe("POST");
      const body = init.body as FormData;
      expect(body.get("title")).toBe("Test task");
    });
  });

  describe("activateTask", () => {
    it("POSTs to /api/tasks/:id/activate", async () => {
      const { activateTask } = await import("../../../dashboard-v2/src/server/functions.ts");
      const result = await activateTask({ data: { id: "t1" } });
      expect(result).toEqual({ success: true });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/tasks/t1/activate");
    });
  });

  describe("completeTask", () => {
    it("POSTs to /api/tasks/:id/complete", async () => {
      const { completeTask } = await import("../../../dashboard-v2/src/server/functions.ts");
      await completeTask({ data: { id: "t2" } });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/tasks/t2/complete");
    });
  });

  describe("failTask", () => {
    it("POSTs to /api/tasks/:id/fail", async () => {
      const { failTask } = await import("../../../dashboard-v2/src/server/functions.ts");
      await failTask({ data: { id: "t3" } });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/tasks/t3/fail");
    });
  });

  describe("updateTask", () => {
    it("PUTs to /api/tasks/:id with FormData", async () => {
      const { updateTask } = await import("../../../dashboard-v2/src/server/functions.ts");
      await updateTask({ data: { id: "t1", title: "Updated" } });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/tasks/t1");
      expect(init.method).toBe("PUT");
    });
  });

  describe("cancelTask", () => {
    it("DELETEs /api/tasks/:id", async () => {
      const { cancelTask } = await import("../../../dashboard-v2/src/server/functions.ts");
      await cancelTask({ data: { id: "t1" } });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/tasks/t1");
      expect(init.method).toBe("DELETE");
    });
  });

  describe("approveAction", () => {
    it("POSTs to /api/actions/:id/approve", async () => {
      const { approveAction } = await import("../../../dashboard-v2/src/server/functions.ts");
      await approveAction({ data: { id: "a1" } });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/actions/a1/approve");
    });
  });

  describe("rejectAction", () => {
    it("POSTs to /api/actions/:id/reject", async () => {
      const { rejectAction } = await import("../../../dashboard-v2/src/server/functions.ts");
      await rejectAction({ data: { id: "a2" } });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/actions/a2/reject");
    });
  });

  describe("askVigil", () => {
    it("POSTs to /api/memory/ask with question in FormData", async () => {
      const { askVigil } = await import("../../../dashboard-v2/src/server/functions.ts");
      await askVigil({ data: { question: "What is vigil?", repo: "vigil" } });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/memory/ask");
      expect(init.method).toBe("POST");
      const body = init.body as FormData;
      expect(body.get("askq")).toBe("What is vigil?");
      expect(body.get("askrepo")).toBe("vigil");
    });
  });

  describe("createSchedule", () => {
    it("POSTs to /api/scheduler with FormData", async () => {
      const { createSchedule } = await import("../../../dashboard-v2/src/server/functions.ts");
      await createSchedule({
        data: { name: "Hourly", cron: "0 * * * *", action: "dream", repo: "vigil" },
      });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/scheduler");
      expect(init.method).toBe("POST");
    });
  });

  describe("deleteSchedule", () => {
    it("DELETEs /api/scheduler/:id", async () => {
      const { deleteSchedule } = await import("../../../dashboard-v2/src/server/functions.ts");
      await deleteSchedule({ data: { id: "s1" } });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/scheduler/s1");
      expect(init.method).toBe("DELETE");
    });
  });

  describe("triggerSchedule", () => {
    it("POSTs to /api/scheduler/:id/trigger", async () => {
      const { triggerSchedule } = await import("../../../dashboard-v2/src/server/functions.ts");
      await triggerSchedule({ data: { id: "s1" } });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/scheduler/s1/trigger");
    });
  });
});
