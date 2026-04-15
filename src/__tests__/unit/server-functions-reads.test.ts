import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  createFakeDashboardContext,
} from "../helpers/dashboard-v2-helpers.ts";

describe("server functions -- reads", () => {
  let ctxSpy: ReturnType<typeof spyOn>;
  let fakeCtx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(async () => {
    fakeCtx = createFakeDashboardContext();
    const vigilCtxMod = await import(
      "../../../dashboard-v2/src/server/vigil-context.ts"
    );
    ctxSpy = spyOn(vigilCtxMod, "getVigilContext").mockReturnValue(
      fakeCtx as any,
    );
  });

  afterEach(() => {
    ctxSpy.mockRestore();
  });

  describe("getOverview", () => {
    it("calls getOverviewJSON with context", async () => {
      const overviewMod = await import(
        "../../dashboard/api/overview.ts"
      );
      const handlerSpy = spyOn(overviewMod, "getOverviewJSON").mockReturnValue({
        uptime: 0,
        repos: [],
        recentMessages: [],
        pendingActions: 0,
        activeTasks: 0,
      } as any);

      const { getOverview } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      const result = await getOverview();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getRepoDetail", () => {
    it("calls getRepoDetailJSON with context and repo name", async () => {
      const reposMod = await import("../../dashboard/api/repos.ts");
      const handlerSpy = spyOn(reposMod, "getRepoDetailJSON").mockReturnValue({
        name: "vigil",
        topics: [],
        recentEvents: [],
      } as any);

      const { getRepoDetail } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      const result = await getRepoDetail({ data: { name: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("vigil");

      handlerSpy.mockRestore();
    });
  });

  describe("getTimeline", () => {
    it("calls getTimelineJSON with context and constructed URL", async () => {
      const timelineMod = await import("../../dashboard/api/timeline.ts");
      const handlerSpy = spyOn(
        timelineMod,
        "getTimelineJSON",
      ).mockReturnValue({
        messages: [],
        page: 1,
        hasMore: false,
      } as any);

      const { getTimeline } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getTimeline({
        data: { status: "alert", repo: "vigil", page: 2 },
      });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      const urlArg = handlerSpy.mock.calls[0][1];
      expect(urlArg).toBeInstanceOf(URL);
      expect(urlArg.searchParams.get("status")).toBe("alert");
      expect(urlArg.searchParams.get("repo")).toBe("vigil");
      expect(urlArg.searchParams.get("page")).toBe("2");

      handlerSpy.mockRestore();
    });
  });

  describe("searchMemory", () => {
    it("calls getMemorySearchJSON with query and optional repo", async () => {
      const memoryMod = await import("../../dashboard/api/memory.ts");
      const handlerSpy = spyOn(
        memoryMod,
        "getMemorySearchJSON",
      ).mockReturnValue({ results: [] } as any);

      const { searchMemory } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await searchMemory({ data: { query: "git merge", repo: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("git merge");
      expect(handlerSpy.mock.calls[0][2]).toBe("vigil");

      handlerSpy.mockRestore();
    });
  });

  describe("getDreamPatterns", () => {
    it("calls getDreamPatternsJSON with context and repo", async () => {
      const dreamsMod = await import("../../dashboard/api/dreams.ts");
      const handlerSpy = spyOn(
        dreamsMod,
        "getDreamPatternsJSON",
      ).mockReturnValue({ patterns: [] } as any);

      const { getDreamPatterns } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getDreamPatterns({ data: { repo: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toBe("vigil");

      handlerSpy.mockRestore();
    });
  });

  describe("getRepos", () => {
    it("calls getReposJSON with context", async () => {
      const reposMod = await import("../../dashboard/api/repos.ts");
      const handlerSpy = spyOn(reposMod, "getReposJSON").mockReturnValue(
        [] as any,
      );

      const { getRepos } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getRepos();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getDreams", () => {
    it("calls getDreamsJSON with context", async () => {
      const dreamsMod = await import("../../dashboard/api/dreams.ts");
      const handlerSpy = spyOn(dreamsMod, "getDreamsJSON").mockReturnValue({
        dreams: [],
        status: { running: false },
      } as any);

      const { getDreams } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getDreams();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getTasks", () => {
    it("calls getTasksJSON with context and options", async () => {
      const tasksMod = await import("../../dashboard/api/tasks.ts");
      const handlerSpy = spyOn(tasksMod, "getTasksJSON").mockReturnValue({
        tasks: [],
        counts: {},
        completionRate: 0,
      } as any);

      const { getTasks } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getTasks({ data: { status: "active", repo: "vigil" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toEqual({ status: "active", repo: "vigil" });

      handlerSpy.mockRestore();
    });
  });

  describe("getActions", () => {
    it("calls getActionsJSON with context and options", async () => {
      const actionsMod = await import("../../dashboard/api/actions.ts");
      const handlerSpy = spyOn(actionsMod, "getActionsJSON").mockReturnValue({
        actions: [],
        pending: [],
        stats: {},
      } as any);

      const { getActions } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getActions({ data: { status: "pending" } });

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);
      expect(handlerSpy.mock.calls[0][1]).toEqual({ status: "pending" });

      handlerSpy.mockRestore();
    });
  });

  describe("getActionsPending", () => {
    it("calls getActionsPendingJSON with context", async () => {
      const actionsMod = await import("../../dashboard/api/actions.ts");
      const handlerSpy = spyOn(actionsMod, "getActionsPendingJSON").mockReturnValue({
        pending: [],
      } as any);

      const { getActionsPending } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getActionsPending();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getMemory", () => {
    it("calls getMemoryJSON with context", async () => {
      const memoryMod = await import("../../dashboard/api/memory.ts");
      const handlerSpy = spyOn(memoryMod, "getMemoryJSON").mockReturnValue({
        pipeline: {},
        profiles: [],
      } as any);

      const { getMemory } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getMemory();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getMetrics", () => {
    it("calls getMetricsJSON with context", async () => {
      const metricsMod = await import("../../dashboard/api/metrics.ts");
      const handlerSpy = spyOn(metricsMod, "getMetricsJSON").mockReturnValue({
        decisions: {},
        latency: {},
      } as any);

      const { getMetrics } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getMetrics();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });

  describe("getScheduler", () => {
    it("calls getSchedulerJSON with context", async () => {
      const schedulerMod = await import("../../dashboard/api/scheduler.ts");
      const handlerSpy = spyOn(schedulerMod, "getSchedulerJSON").mockReturnValue({
        entries: [],
        history: [],
      } as any);

      const { getScheduler } = await import(
        "../../../dashboard-v2/src/server/functions.ts"
      );

      await getScheduler();

      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]).toBe(fakeCtx);

      handlerSpy.mockRestore();
    });
  });
});
